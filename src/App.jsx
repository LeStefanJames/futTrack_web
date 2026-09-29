import { useState, useEffect, Component } from "react";
import { supabase } from "./supabaseClient.js";

const STATE_ROW_ID = 1;

// Sem isto, qualquer erro de render (nesta app ou no runtime à volta dela)
// desmonta a árvore toda e deixa o ecrã em branco, sem hipótese de recuperar
// sem dar refresh manual. Isto mostra um aviso com botão de recarregar em vez
// de ecrã branco, e regista o erro na consola para conseguirmos perceber a causa.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("f-tracker: erro capturado pelo ErrorBoundary", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app">
          <style>{styles}</style>
          <div className="loadingScreen">
            Ocorreu um erro inesperado.
            <div style={{ marginTop: "1rem" }}>
              <button className="btn btnPrimary" onClick={() => window.location.reload()}>
                Recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_CONFIG = {
  weights: { win: 3, draw: 1, loss: 2, goal: 0.5, assist: 0.3, mvp: 2 },
  // Precisa de mais jogos para atingir confiança total — evita que 1-2 jogos
  // bons (ou maus) disparem logo alguém para o topo/fundo da tabela.
  confidenceGames: 7,
};

// Inputs com estado local: enquanto escreves, só o próprio campo re-renderiza
// (rápido). O valor só é gravado na app (e na rede) quando sais do campo —
// evita gravar e recalcular tudo a cada tecla, que estava a causar lentidão
// e saltos de scroll no telemóvel.
function LocalTextInput({ value, onCommit, ...rest }) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <input
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
    />
  );
}

function LocalNumberInput({ value, onCommit, ...rest }) {
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => {
    setLocal(String(value ?? 0));
  }, [value]);
  return (
    <input
      {...rest}
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = Number(local) || 0;
        setLocal(String(n));
        if (n !== value) onCommit(n);
      }}
    />
  );
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDatePT(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function emptyGame(count) {
  const date = todayISO();
  return {
    id: uid(),
    label: formatDatePT(date),
    date,
    status: "setup", // setup -> equipas -> jogo -> votacao -> finalizado
    convocados: [],
    teamA: [],
    teamB: [],
    score: { a: 0, b: 0 },
    stats: {},
    mvpVotes: [], // { voterId, votedForId }
    votingDeadline: null,
  };
}

function gameResult(game) {
  const a = Number(game.score.a) || 0;
  const b = Number(game.score.b) || 0;
  return a === b ? "draw" : a > b ? "A" : "B";
}

function wasOnWinningTeam(playerId, game) {
  const result = gameResult(game);
  if (result === "draw") return false;
  return result === "A" ? game.teamA.includes(playerId) : game.teamB.includes(playerId);
}

// Conta os votos de MVP e desempata pela ordem: 1) quem ganhou o jogo,
// 2) quem marcou mais golos, 3) quem assistiu mais. Se mesmo assim continuar
// empatado, o MVP fica partilhado entre os empatados.
function computeMvpWinners(game) {
  const tally = {};
  game.mvpVotes.forEach((v) => {
    tally[v.votedForId] = (tally[v.votedForId] || 0) + 1;
  });
  const counts = Object.values(tally);
  if (!counts.length) return [];
  const maxVotes = Math.max(...counts);
  if (maxVotes === 0) return [];
  let candidates = Object.keys(tally).filter((id) => tally[id] === maxVotes);

  if (candidates.length > 1) {
    const won = candidates.filter((pid) => wasOnWinningTeam(pid, game));
    if (won.length > 0 && won.length < candidates.length) candidates = won;
  }
  if (candidates.length > 1) {
    const goalsOf = (pid) => Number((game.stats[pid] && game.stats[pid].goals) || 0);
    const maxG = Math.max(...candidates.map(goalsOf));
    const top = candidates.filter((pid) => goalsOf(pid) === maxG);
    if (top.length < candidates.length) candidates = top;
  }
  if (candidates.length > 1) {
    const assistsOf = (pid) => Number((game.stats[pid] && game.stats[pid].assists) || 0);
    const maxAst = Math.max(...candidates.map(assistsOf));
    const top = candidates.filter((pid) => assistsOf(pid) === maxAst);
    if (top.length < candidates.length) candidates = top;
  }
  return candidates;
}

function formatRemaining(deadlineISO) {
  if (!deadlineISO) return "";
  const diff = new Date(deadlineISO).getTime() - Date.now();
  if (diff <= 0) return "encerrada";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 1) return `${hours}h ${mins}m restantes`;
  return `${mins}m restantes`;
}

function formatDateTimePT(iso) {
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Quantos golos/assistências num só jogo já valem a pontuação máxima dessa
// componente (curva de retornos decrescentes, satura em vez de crescer sem fim).
const GOAL_SATURATION = 5;
const ASSIST_SATURATION = 5;

// Pontuação de um único jogo, em 0-10, como MÉDIA PONDERADA das componentes
// (resultado, golos, assistências, MVP) em vez de uma soma direta dos pontos.
// Isto evita que um jogo excecional (ex: vitória + hat-trick + MVP) dispare
// para um valor sem limite superior — cada componente já vem espremida para
// 0-10 e o peso do utilizador só decide quanto conta na média, não quanto se
// soma. Com poucos jogos registados, é isto que reduz as oscilações grandes.
function perGameScore(w, resultKind, goals, assists, mvpVoteShare) {
  const resultScore = resultKind === "win" ? 10 : resultKind === "draw" ? 5 : 0;
  const resultWeight = resultKind === "win" ? w.win : resultKind === "draw" ? w.draw : w.loss;

  const goalScore = Math.min(10, (10 * Math.sqrt(goals)) / Math.sqrt(GOAL_SATURATION));
  const assistScore = Math.min(10, (10 * Math.sqrt(assists)) / Math.sqrt(ASSIST_SATURATION));
  // Proporcional aos votos recebidos nesse jogo, não só ao vencedor.
  const mvpScore = mvpVoteShare * 10;

  const totalWeight = resultWeight + w.goal + w.assist + w.mvp;
  if (totalWeight <= 0) return 5;
  return (
    (resultWeight * resultScore + w.goal * goalScore + w.assist * assistScore + w.mvp * mvpScore) /
    totalWeight
  );
}

function computeRanking(players, games, config) {
  const w = config.weights;
  const DECAY = 0.85; // cada jogo mais antigo pesa 85% do seguinte
  const map = {};
  players.forEach((p) => {
    map[p.id] = {
      id: p.id,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      mvps: 0,
      perGame: [],
      raw: 0,
      norm: 0,
    };
  });
  const finished = games
    .filter((g) => g.status === "finalizado")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  finished.forEach((g) => {
    const result = gameResult(g);
    const mvpWinners = computeMvpWinners(g);
    const mvpTally = {};
    g.mvpVotes.forEach((v) => {
      mvpTally[v.votedForId] = (mvpTally[v.votedForId] || 0) + 1;
    });
    const totalMvpVotes = g.mvpVotes.length;

    g.convocados.forEach((pid) => {
      if (!map[pid]) return;
      const m = map[pid];
      m.games += 1;
      const inA = g.teamA.includes(pid);
      const inB = g.teamB.includes(pid);
      let resultKind = null;
      if (result === "draw") {
        m.draws += 1;
        resultKind = "draw";
      } else if ((result === "A" && inA) || (result === "B" && inB)) {
        m.wins += 1;
        resultKind = "win";
      } else if (inA || inB) {
        m.losses += 1;
        resultKind = "loss";
      }
      const s = g.stats[pid] || { goals: 0, assists: 0 };
      const goals = Number(s.goals) || 0;
      const assists = Number(s.assists) || 0;
      const isMvp = mvpWinners.includes(pid);
      m.goals += goals;
      m.assists += assists;
      if (isMvp) m.mvps += 1;

      const mvpVoteShare = totalMvpVotes > 0 ? (mvpTally[pid] || 0) / totalMvpVotes : 0;
      // Pontuação deste jogo, já em 0-10 (ver perGameScore acima)
      m.perGame.push(perGameScore(w, resultKind, goals, assists, mvpVoteShare));
    });
  });

  const confGames = config.confidenceGames || 5;
  // Alarga a distância ao neutro (5) para quem já tem confiança suficiente —
  // sem isto, mesmo uma sequência excelente (muitas vitórias/golos/assists/MVPs)
  // ficava sempre "encostada" ao 5 e não se distinguia o suficiente de uma
  // época mediana.
  const SCORE_SPREAD = 1.8;

  // Média ponderada por recência (jogos recentes pesam mais). Como cada jogo
  // já está em 0-10, esta média fica sempre em 0-10 — não é preciso reescalar
  // com base no melhor jogador atual, o que antes fazia a pontuação de toda a
  // gente oscilar sempre que o topo da tabela mudava.
  Object.values(map).forEach((r) => {
    const n = r.perGame.length;
    if (n === 0) {
      r.norm = 0;
      return;
    }
    let num = 0;
    let den = 0;
    r.perGame.forEach((pts, i) => {
      const wt = Math.pow(DECAY, n - 1 - i);
      num += pts * wt;
      den += wt;
    });
    r.raw = num / den;

    // Com poucos jogos, puxa o score para o neutro (5) por confiança
    // (precisa de confGames jogos para atingir confiança total).
    const confidence = Math.min(1, r.games / confGames);
    const spreadRaw = Math.max(0, Math.min(10, 5 + (r.raw - 5) * SCORE_SPREAD));
    r.norm = confidence * spreadRaw + (1 - confidence) * 5;
  });

  return map;
}

// Conversão direta do score 0-10 para uma "cotação de mercado" de 0€ a 200M€
// (piada estilo Transfermarkt: 0 = sem jogos ou score muito baixo, 200M = topo absoluto).
const MAX_MARKET_VALUE = 200_000_000;
function marketValue(norm) {
  const clamped = Math.max(0, Math.min(10, norm || 0));
  return (clamped / 10) * MAX_MARKET_VALUE;
}

function formatMarketValue(value) {
  if (value <= 0) return "0 €";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M €`;
  }
  const thousands = value / 1000;
  return `${thousands.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} mil €`;
}

function balancingScore(playerId, rankingMap) {
  const r = rankingMap[playerId];
  if (r && r.games > 0) return r.norm;
  const withGames = Object.values(rankingMap).filter((x) => x.games > 0);
  if (withGames.length === 0) return 5;
  return withGames.reduce((s, x) => s + x.norm, 0) / withGames.length;
}

// Troca pares entre as duas listas enquanto isso reduzir a diferença de soma
// entre elas — corrige os mínimos locais em que o preenchimento guloso (um
// jogador de cada vez, por ordem de score) deixa a divisão pior do que outras
// combinações possíveis com o mesmo grupo de jogadores.
function twoOptBalance(idsA, idsB, scoreFn) {
  const a = [...idsA];
  const b = [...idsB];
  let sumA = a.reduce((s, id) => s + scoreFn(id), 0);
  let sumB = b.reduce((s, id) => s + scoreFn(id), 0);

  let improved = true;
  while (improved) {
    improved = false;
    let best = null;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        const sA = scoreFn(a[i]);
        const sB = scoreFn(b[j]);
        const newSumA = sumA - sA + sB;
        const newSumB = sumB - sB + sA;
        const newDiff = Math.abs(newSumA - newSumB);
        if (!best || newDiff < best.newDiff) {
          best = { i, j, newDiff, newSumA, newSumB };
        }
      }
    }
    if (best && best.newDiff < Math.abs(sumA - sumB) - 1e-9) {
      const tmp = a[best.i];
      a[best.i] = b[best.j];
      b[best.j] = tmp;
      sumA = best.newSumA;
      sumB = best.newSumB;
      improved = true;
    }
  }
  return { a, b };
}

function gerarEquipas(convocadoIds, players, rankingMap) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const convocados = convocadoIds.map((id) => byId[id]).filter(Boolean);
  const scoreFn = (id) => balancingScore(id, rankingMap);

  const goleiros = [...convocados]
    .filter((p) => p.isGK)
    .sort((a, b) => scoreFn(b.id) - scoreFn(a.id));
  const linha = [...convocados]
    .filter((p) => !p.isGK)
    .sort((a, b) => scoreFn(b.id) - scoreFn(a.id));

  let gkA = [];
  let gkB = [];
  goleiros.forEach((p, i) => {
    if (i % 2 === 0) gkA.push(p.id);
    else gkB.push(p.id);
  });
  ({ a: gkA, b: gkB } = twoOptBalance(gkA, gkB, scoreFn));

  // Tamanhos-alvo por equipa (guarda-redes + jogadores de linha) para que os
  // dois lados fiquem com o mesmo número de jogadores (±1).
  const totalSize = convocados.length;
  const sizeTargetA = Math.ceil(totalSize / 2);
  const outfieldTargetA = Math.max(0, Math.min(linha.length, sizeTargetA - gkA.length));
  const outfieldTargetB = linha.length - outfieldTargetA;

  let lineA = [];
  let lineB = [];
  let sumA = gkA.reduce((s, id) => s + scoreFn(id), 0);
  let sumB = gkB.reduce((s, id) => s + scoreFn(id), 0);
  linha.forEach((p) => {
    const s = scoreFn(p.id);
    const aOpen = lineA.length < outfieldTargetA;
    const bOpen = lineB.length < outfieldTargetB;
    if (aOpen && (!bOpen || sumA <= sumB)) {
      lineA.push(p.id);
      sumA += s;
    } else {
      lineB.push(p.id);
      sumB += s;
    }
  });
  ({ a: lineA, b: lineB } = twoOptBalance(lineA, lineB, scoreFn));

  return { teamA: [...gkA, ...lineA], teamB: [...gkB, ...lineB] };
}

function within(dateStr, from, to) {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  );
}

function AppRoot() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [tab, setTab] = useState("ranking");

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerGK, setNewPlayerGK] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const [openGameId, setOpenGameId] = useState(null);
  const [votingAs, setVotingAs] = useState(null);
  const [voteChoice, setVoteChoice] = useState(null);
  const [gkWarning, setGkWarning] = useState("");

  const [filters, setFilters] = useState({
    from: "",
    to: "",
    minGames: 0,
    minGoals: 0,
    minAssists: 0,
    minMvps: 0,
    minWins: 0,
    sortBy: "goals",
  });

  const [weightsDraft, setWeightsDraft] = useState(DEFAULT_CONFIG.weights);
  const [confDraft, setConfDraft] = useState(DEFAULT_CONFIG.confidenceGames);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);

  useEffect(() => {
    load();

    // Atualiza em tempo real quando outro browser/telemóvel grava dados novos,
    // para todos verem o mesmo estado sem terem de recarregar a página.
    const channel = supabase
      .channel("app_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_state", filter: `id=eq.${STATE_ROW_ID}` },
        (payload) => {
          const next = payload.new.data;
          setData(next);
          setWeightsDraft(next.config.weights);
          setConfDraft(next.config.confidenceGames || 5);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    try {
      const { data: row, error } = await supabase
        .from("app_state")
        .select("data")
        .eq("id", STATE_ROW_ID)
        .single();
      if (error) throw error;
      const parsed = row.data || {};
      const next = {
        players: parsed.players || [],
        games: parsed.games || [],
        config: parsed.config || DEFAULT_CONFIG,
      };
      setData(next);
      setWeightsDraft(next.config.weights);
      setConfDraft(next.config.confidenceGames || 5);
    } catch (e) {
      setData({ players: [], games: [], config: DEFAULT_CONFIG });
    } finally {
      setLoaded(true);
    }
  }

  async function persist(next) {
    setData(next);
    try {
      const { error } = await supabase
        .from("app_state")
        .update({ data: next })
        .eq("id", STATE_ROW_ID);
      if (error) throw error;
      setSaveError("");
    } catch (e) {
      setSaveError("Não foi possível guardar. Verifica a ligação e tenta novamente.");
    }
  }

  // Fecha automaticamente a votação de qualquer jogo cujo prazo de 24h já
  // tenha passado, aplicando o desempate. Corre sempre que os dados mudam
  // (ex: ao abrir a app, ou depois de qualquer ação) — usa a hora real do
  // relógio do dispositivo em cada verificação, sem precisar de nenhum
  // temporizador contínuo em segundo plano (isso estava a causar
  // instabilidade no browser).
  useEffect(() => {
    if (!data) return;
    const nowTs = Date.now();
    const due = data.games.filter(
      (g) => g.status === "votacao" && g.votingDeadline && new Date(g.votingDeadline).getTime() <= nowTs
    );
    if (due.length === 0) return;
    const dueIds = new Set(due.map((g) => g.id));
    const nextGames = data.games.map((g) => (dueIds.has(g.id) ? { ...g, status: "finalizado" } : g));
    persist({ ...data, games: nextGames });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!loaded || !data) {
    return (
      <div className="app">
        <style>{styles}</style>
        <div className="loadingScreen">A carregar dados…</div>
      </div>
    );
  }

  const players = data.players;
  const games = data.games;
  const config = data.config;
  const rankingMap = computeRanking(players, games, config);
  const activePlayers = players.filter((p) => p.active !== false);

  function playerName(id) {
    const p = players.find((x) => x.id === id);
    return p ? p.name : "(removido)";
  }

  function gamesPlayedCount(playerId) {
    return games.filter((g) => g.convocados.includes(playerId)).length;
  }

  // ---- Jogadores ----
  function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    const p = { id: uid(), name, isGK: newPlayerGK, active: true };
    persist({ ...data, players: [...players, p] });
    setNewPlayerName("");
    setNewPlayerGK(false);
  }

  function toggleActive(id, active) {
    persist({ ...data, players: players.map((p) => (p.id === id ? { ...p, active } : p)) });
  }

  function removePlayer(id) {
    if (gamesPlayedCount(id) > 0) {
      toggleActive(id, false);
    } else {
      persist({ ...data, players: players.filter((p) => p.id !== id) });
    }
    setConfirmRemoveId(null);
  }

  function toggleGK(id) {
    persist({ ...data, players: players.map((p) => (p.id === id ? { ...p, isGK: !p.isGK } : p)) });
  }

  // ---- Jogos ----
  function addGame() {
    const g = emptyGame(games.length + 1);
    persist({ ...data, games: [g, ...games] });
    setOpenGameId(g.id);
  }

  function updateGame(gameId, updater) {
    const next = games.map((g) => (g.id === gameId ? updater(g) : g));
    persist({ ...data, games: next });
  }

  function toggleConvocado(gameId, playerId) {
    const game = games.find((g) => g.id === gameId);
    const player = players.find((p) => p.id === playerId);
    const has = game.convocados.includes(playerId);

    if (!has && player && player.isGK) {
      const currentGKs = game.convocados.filter((id) => {
        const p = players.find((x) => x.id === id);
        return p && p.isGK;
      }).length;
      if (currentGKs >= 2) {
        setGkWarning("Só podes convocar 2 guarda-redes por jogo.");
        return;
      }
    }
    setGkWarning("");
    updateGame(gameId, (g) => ({
      ...g,
      convocados: has ? g.convocados.filter((x) => x !== playerId) : [...g.convocados, playerId],
    }));
  }

  function gerarEquipasParaJogo(gameId) {
    updateGame(gameId, (g) => {
      const { teamA, teamB } = gerarEquipas(g.convocados, players, rankingMap);
      return { ...g, teamA, teamB, status: "equipas" };
    });
  }

  function swapPlayers(gameId, idA, idB) {
    updateGame(gameId, (g) => {
      const inA = (id) => g.teamA.includes(id);
      const inB = (id) => g.teamB.includes(id);
      if (inA(idA) === inA(idB)) return g; // têm de estar em equipas diferentes
      const teamA = g.teamA.map((x) => (x === idA ? idB : x === idB ? idA : x));
      const teamB = g.teamB.map((x) => (x === idA ? idB : x === idB ? idA : x));
      return { ...g, teamA, teamB };
    });
  }

  function goToResultado(gameId) {
    updateGame(gameId, (g) => ({ ...g, status: "jogo" }));
  }

  function setScore(gameId, side, value) {
    updateGame(gameId, (g) => ({ ...g, score: { ...g.score, [side]: Number(value) || 0 } }));
  }

  function setStat(gameId, playerId, field, value) {
    updateGame(gameId, (g) => {
      const current = g.stats[playerId] || { goals: 0, assists: 0 };
      return {
        ...g,
        stats: { ...g.stats, [playerId]: { ...current, [field]: Number(value) || 0 } },
      };
    });
  }

  function openVoting(gameId) {
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    updateGame(gameId, (g) => ({ ...g, status: "votacao", votingDeadline: deadline }));
  }

  function submitVote(gameId, voterId, votedForId) {
    if (!voterId || !votedForId) return;
    updateGame(gameId, (g) => ({
      ...g,
      mvpVotes: [...g.mvpVotes.filter((v) => v.voterId !== voterId), { voterId, votedForId }],
    }));
    setVoteChoice(null);
    setEditingVote(false);
  }

  function finalizeGame(gameId) {
    updateGame(gameId, (g) => ({ ...g, status: "finalizado" }));
  }

  function reopenGame(gameId) {
    updateGame(gameId, (g) => ({ ...g, status: "jogo", votingDeadline: null }));
  }

  function removeGame(gameId) {
    persist({ ...data, games: games.filter((g) => g.id !== gameId) });
    if (openGameId === gameId) setOpenGameId(null);
    setConfirmRemoveId(null);
  }

  // ---- Configurações ----
  function saveWeights() {
    persist({
      ...data,
      config: { ...config, weights: weightsDraft, confidenceGames: Number(confDraft) || 5 },
    });
  }

  // ---- Cópia de segurança ----
  function exportBackup() {
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `futebol-das-segundas-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setImportMsg("Não foi possível gerar o ficheiro de backup neste dispositivo.");
    }
  }

  function runImport() {
    try {
      const parsed = JSON.parse(importText);
      if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.games)) {
        setImportMsg("Este ficheiro não parece ser um backup válido desta app.");
        return;
      }
      const next = {
        players: parsed.players,
        games: parsed.games,
        config: parsed.config || DEFAULT_CONFIG,
      };
      persist(next);
      setWeightsDraft(next.config.weights);
      setConfDraft(next.config.confidenceGames || 5);
      setImportMsg("Dados restaurados com sucesso.");
      setImportText("");
      setConfirmImport(false);
    } catch (e) {
      setImportMsg("Não consegui ler este ficheiro — confirma que colaste o JSON completo do backup.");
    }
  }

  // ---- Estatísticas ----
  function statsForPlayers() {
    const filteredGames = games.filter(
      (g) => g.status === "finalizado" && within(g.date, filters.from, filters.to)
    );
    const map = computeRanking(players, filteredGames, config);
    let rows = players.map((p) => ({ player: p, ...map[p.id] }));
    rows = rows.filter(
      (r) =>
        r.games >= Number(filters.minGames || 0) &&
        r.goals >= Number(filters.minGoals || 0) &&
        r.assists >= Number(filters.minAssists || 0) &&
        r.mvps >= Number(filters.minMvps || 0) &&
        r.wins >= Number(filters.minWins || 0)
    );
    rows.sort((a, b) => b[filters.sortBy] - a[filters.sortBy]);
    return rows;
  }

  function setPeriodPreset(preset) {
    const today = todayISO();
    if (preset === "all") setFilters((f) => ({ ...f, from: "", to: "" }));
    else if (preset === "month") {
      const d = new Date();
      const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      setFilters((f) => ({ ...f, from: first, to: today }));
    } else if (preset === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFilters((f) => ({ ...f, from: d.toISOString().slice(0, 10), to: today }));
    }
  }

  const ranking = players
    .map((p) => ({ player: p, ...rankingMap[p.id] }))
    .sort((a, b) => b.norm - a.norm || b.games - a.games);

  const sortedGames = [...games].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="app">
      <style>{styles}</style>

      <header className="header">
        <div className="wordmark">Futebol das Segundas</div>
        <div className="tagline">v2 — toda a segunda, um jogo. aqui fica o registo.</div>
      </header>

      <nav className="nav">
        {[
          ["ranking", "Ranking"],
          ["jogos", "Jogos"],
          ["estatisticas", "Estatísticas"],
          ["jogadores", "Jogadores"],
          ["config", "Configurações"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={"navBtn" + (tab === id ? " navBtnActive" : "")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {saveError && <div className="errorBar">{saveError}</div>}

      <main className="main">
        {tab === "jogadores" && (
          <section className="panel">
            <div className="card">
              <h2>Adicionar jogador</h2>
              <div className="fieldRow">
                <input
                  className="input"
                  placeholder="Nome do jogador"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                />
                <label className="checkboxLabel">
                  <input
                    type="checkbox"
                    checked={newPlayerGK}
                    onChange={(e) => setNewPlayerGK(e.target.checked)}
                  />
                  Guarda-redes
                </label>
                <button className="btn btnPrimary" onClick={addPlayer}>
                  Adicionar
                </button>
              </div>
            </div>

            <div className="card">
              <div className="cardHeaderRow">
                <h2>Lista de jogadores ({activePlayers.length})</h2>
                <label className="checkboxLabel">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />
                  Mostrar inativos
                </label>
              </div>
              {players.length === 0 && <p className="emptyState">Ainda não há jogadores. Adiciona o primeiro acima.</p>}
              <ul className="playerList">
                {players
                  .filter((p) => showInactive || p.active !== false)
                  .map((p) => (
                    <li key={p.id} className={"playerRow" + (p.active === false ? " playerInactive" : "")}>
                      <span className="playerName">
                        {p.name}
                        {p.isGK && <span className="tagGK">GR</span>}
                        {p.active === false && <span className="tagInactive">inativo</span>}
                      </span>
                      <span className="playerActions">
                        <button className="btn btnGhost" onClick={() => toggleGK(p.id)}>
                          {p.isGK ? "Remover GR" : "Marcar GR"}
                        </button>
                        {p.active === false ? (
                          <button className="btn btnGhost" onClick={() => toggleActive(p.id, true)}>
                            Reativar
                          </button>
                        ) : confirmRemoveId === p.id ? (
                          <>
                            <button className="btn btnDanger" onClick={() => removePlayer(p.id)}>
                              Confirmar
                            </button>
                            <button className="btn btnGhost" onClick={() => setConfirmRemoveId(null)}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button className="btn btnGhost" onClick={() => setConfirmRemoveId(p.id)}>
                            Remover
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="hint">
                Um jogador com jogos registados nunca é apagado de vez — fica marcado como inativo para não perder o
                histórico dele no ranking e nas estatísticas.
              </p>
            </div>
          </section>
        )}

        {tab === "jogos" && (
          <section className="panel">
            <div className="cardHeaderRow">
              <h2>Jogos</h2>
              <button className="btn btnPrimary" onClick={addGame}>
                + Novo jogo
              </button>
            </div>

            {sortedGames.length === 0 && <p className="emptyState">Ainda não há jogos registados.</p>}

            <ul className="gameList">
              {sortedGames.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  open={openGameId === g.id}
                  onToggleOpen={() => setOpenGameId(openGameId === g.id ? null : g.id)}
                  players={players}
                  activePlayers={activePlayers}
                  playerName={playerName}
                  rankingMap={rankingMap}
                  onToggleConvocado={(pid) => toggleConvocado(g.id, pid)}
                  gkWarning={g.id === openGameId ? gkWarning : ""}
                  onUpdateLabel={(label) => updateGame(g.id, (gg) => ({ ...gg, label }))}
                  onUpdateDate={(date) => updateGame(g.id, (gg) => ({ ...gg, date }))}
                  onGerarEquipas={() => gerarEquipasParaJogo(g.id)}
                  onSwap={(idA, idB) => swapPlayers(g.id, idA, idB)}
                  onGoToResultado={() => goToResultado(g.id)}
                  onSetScore={(side, v) => setScore(g.id, side, v)}
                  onSetStat={(pid, field, v) => setStat(g.id, pid, field, v)}
                  votingAs={votingAs}
                  voteChoice={voteChoice}
                  setVotingAs={setVotingAs}
                  setVoteChoice={setVoteChoice}
                  onSubmitVote={(voterId, votedForId) => submitVote(g.id, voterId, votedForId)}
                  onOpenVoting={() => openVoting(g.id)}
                  onFinalize={() => finalizeGame(g.id)}
                  onReopen={() => reopenGame(g.id)}
                  confirmRemoveId={confirmRemoveId}
                  setConfirmRemoveId={setConfirmRemoveId}
                  onRemoveGame={() => removeGame(g.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {tab === "ranking" && (
          <section className="panel">
            <h2>Ranking geral</h2>
            <p className="hint">Score de 0 a 10, calculado a partir de vitórias, empates, derrotas, golos, assistências e prémios de MVP.</p>
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jogador</th>
                    <th>J</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th>Golos</th>
                    <th>Assist.</th>
                    <th>MVP</th>
                    <th>Score</th>
                    <th>Valor de Mercado</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.player.id} className={r.player.active === false ? "rowInactive" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        {r.player.name}
                        {r.player.isGK && <span className="tagGK">GR</span>}
                      </td>
                      <td>{r.games}</td>
                      <td>{r.wins}</td>
                      <td>{r.draws}</td>
                      <td>{r.losses}</td>
                      <td>{r.goals}</td>
                      <td>{r.assists}</td>
                      <td>{r.mvps}</td>
                      <td className="scoreCell">{r.norm.toFixed(1)}</td>
                      <td className="scoreCell">{formatMarketValue(marketValue(r.norm))}</td>
                    </tr>
                  ))}
                  {ranking.length === 0 && (
                    <tr>
                      <td colSpan={11} className="emptyState">
                        Ainda não há jogadores.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "estatisticas" && (
          <section className="panel">
            <h2>Estatísticas</h2>
            <div className="card">
              <div className="fieldGrid">
                <div className="field">
                  <label>De</label>
                  <input
                    className="input"
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Até</label>
                  <input
                    className="input"
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Mín. jogos</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={filters.minGames}
                    onChange={(e) => setFilters((f) => ({ ...f, minGames: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Mín. golos</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={filters.minGoals}
                    onChange={(e) => setFilters((f) => ({ ...f, minGoals: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Mín. assistências</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={filters.minAssists}
                    onChange={(e) => setFilters((f) => ({ ...f, minAssists: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Mín. vitórias</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={filters.minWins}
                    onChange={(e) => setFilters((f) => ({ ...f, minWins: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Mín. MVPs</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={filters.minMvps}
                    onChange={(e) => setFilters((f) => ({ ...f, minMvps: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Ordenar por</label>
                  <select
                    className="input"
                    value={filters.sortBy}
                    onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))}
                  >
                    <option value="goals">Golos</option>
                    <option value="assists">Assistências</option>
                    <option value="wins">Vitórias</option>
                    <option value="games">Jogos</option>
                    <option value="mvps">MVPs</option>
                    <option value="norm">Score</option>
                  </select>
                </div>
              </div>
              <div className="presetRow">
                <button className="btn btnGhost" onClick={() => setPeriodPreset("all")}>
                  Todos os jogos
                </button>
                <button className="btn btnGhost" onClick={() => setPeriodPreset("month")}>
                  Este mês
                </button>
                <button className="btn btnGhost" onClick={() => setPeriodPreset("30d")}>
                  Últimos 30 dias
                </button>
              </div>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Jogador</th>
                    <th>Jogos</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th>Golos</th>
                    <th>Assist.</th>
                    <th>MVP</th>
                  </tr>
                </thead>
                <tbody>
                  {statsForPlayers().map((r) => (
                    <tr key={r.player.id}>
                      <td>{r.player.name}</td>
                      <td>{r.games}</td>
                      <td>{r.wins}</td>
                      <td>{r.draws}</td>
                      <td>{r.losses}</td>
                      <td>{r.goals}</td>
                      <td>{r.assists}</td>
                      <td>{r.mvps}</td>
                    </tr>
                  ))}
                  {statsForPlayers().length === 0 && (
                    <tr>
                      <td colSpan={8} className="emptyState">
                        Nenhum jogador cumpre estes filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "config" && (
          <section className="panel">
            <h2>Configurações do ranking</h2>
            <p className="hint">
              Ajusta o peso de cada fator na fórmula do score. Vitórias e derrotas costumam pesar mais do que golos e
              assistências.
            </p>
            <div className="card">
              <div className="fieldGrid">
                {[
                  ["win", "Vitória"],
                  ["draw", "Empate"],
                  ["loss", "Derrota (penalização)"],
                  ["goal", "Golo"],
                  ["assist", "Assistência"],
                  ["mvp", "Prémio MVP"],
                ].map(([key, label]) => (
                  <div className="field" key={key}>
                    <label>{label}</label>
                    <input
                      className="input"
                      type="number"
                      step="0.1"
                      value={weightsDraft[key]}
                      onChange={(e) =>
                        setWeightsDraft((w) => ({ ...w, [key]: Number(e.target.value) }))
                      }
                    />
                  </div>
                ))}
              </div>

              <h3>Estabilização do ranking</h3>
              <p className="hint">
                Com poucos jogos, o score de um jogador é puxado para o meio da tabela (5) em vez de
                saltar logo para 10 ou 0 — evita vários "10" artificiais nas primeiras semanas. Este
                número define ao fim de quantos jogos o score passa a refletir 100% o desempenho real.
              </p>
              <div className="field" style={{ maxWidth: "220px", marginBottom: "1rem" }}>
                <label>Jogos até estabilizar</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  value={confDraft}
                  onChange={(e) => setConfDraft(e.target.value)}
                />
              </div>

              <button className="btn btnPrimary" onClick={saveWeights}>
                Guardar configurações
              </button>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Cópia de segurança</h3>
              <p className="hint">
                Os dados vivem dentro deste artifact. Antes de publicares uma versão nova da app, ou
                sempre que quiseres, descarrega uma cópia — assim nunca dependes só da plataforma.
              </p>
              <button className="btn btnGhost" onClick={exportBackup}>
                Descarregar backup (.json)
              </button>

              <h3>Restaurar backup</h3>
              <p className="hint">
                Cola aqui o conteúdo de um ficheiro de backup para repor os dados. Isto substitui tudo o
                que está guardado agora — usa com cuidado.
              </p>
              <textarea
                className="input"
                style={{ width: "100%", minHeight: "100px", fontFamily: "monospace", fontSize: "0.75rem" }}
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setImportMsg("");
                  setConfirmImport(false);
                }}
                placeholder="Cola aqui o JSON do backup…"
              />
              {importMsg && <p className="hint">{importMsg}</p>}
              {confirmImport ? (
                <div className="fieldRow">
                  <span className="warningText">Isto substitui todos os dados atuais. Confirmas?</span>
                  <button className="btn btnDanger" onClick={runImport}>
                    Sim, restaurar
                  </button>
                  <button className="btn btnGhost" onClick={() => setConfirmImport(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  className="btn btnGhost"
                  disabled={!importText.trim()}
                  onClick={() => setConfirmImport(true)}
                >
                  Restaurar a partir do texto acima
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function GameCard(props) {
  const {
    game: g,
    open,
      onToggleOpen,
      players,
      activePlayers,
      playerName,
      rankingMap,
      onToggleConvocado,
      onUpdateLabel,
      onUpdateDate,
      onGerarEquipas,
      onSwap,
      onGoToResultado,
      onSetScore,
      onSetStat,
      votingAs,
      voteChoice,
      setVotingAs,
      setVoteChoice,
      onSubmitVote,
      onOpenVoting,
      onFinalize,
      onReopen,
      confirmRemoveId,
      setConfirmRemoveId,
      onRemoveGame,
      gkWarning,
    } = props;

    const [selectedSwap, setSelectedSwap] = useState(null);

    const statusLabel = {
      setup: "convocatória",
      equipas: "equipas definidas",
      jogo: "a decorrer",
      votacao: "votação aberta",
      finalizado: "finalizado",
    }[g.status];

    const mvpTally = {};
    g.mvpVotes.forEach((v) => {
      mvpTally[v.votedForId] = (mvpTally[v.votedForId] || 0) + 1;
    });
    const mvpWinners = computeMvpWinners(g);
    const maxVotes = mvpWinners.length ? mvpTally[mvpWinners[0]] : 0;
    const votingLocked =
      g.status === "votacao" && g.votingDeadline && new Date(g.votingDeadline).getTime() <= Date.now();

    function handlePlayerTap(pid) {
      if (g.status !== "equipas") return;
      if (!selectedSwap) {
        setSelectedSwap(pid);
        return;
      }
      if (selectedSwap === pid) {
        setSelectedSwap(null);
        return;
      }
      onSwap(selectedSwap, pid);
      setSelectedSwap(null);
    }

    return (
      <li className="gameCard">
        <div className="gameCardHeader" onClick={onToggleOpen}>
          <div>
            <strong>{g.label || formatDatePT(g.date)}</strong>{" "}
            <span className="gameDate">{formatDatePT(g.date)}</span>
          </div>
          <div className="gameStatusRow">
            <span className={"statusPill status-" + g.status}>{statusLabel}</span>
            <span className="chevron">{open ? "▾" : "▸"}</span>
          </div>
        </div>

        {open && (
          <div className="gameCardBody" onClick={(e) => e.stopPropagation()}>
            <div className="fieldRow">
              <LocalTextInput
                className="input"
                value={g.label}
                onCommit={onUpdateLabel}
                placeholder="Nome do jogo (por defeito é a data)"
              />
              <LocalTextInput className="input" type="date" value={g.date} onCommit={onUpdateDate} />
            </div>

            {g.status === "setup" && (
              <>
                <h3>Convocatória</h3>
                <p className="hint">Máximo de 2 guarda-redes por jogo (um para cada equipa).</p>
                <ul className="convocaList">
                  {activePlayers.map((p) => (
                    <li key={p.id}>
                      <label className="checkboxLabel">
                        <input
                          type="checkbox"
                          checked={g.convocados.includes(p.id)}
                          onChange={() => onToggleConvocado(p.id)}
                        />
                        {p.name}
                        {p.isGK && <span className="tagGK">GR</span>}
                      </label>
                    </li>
                  ))}
                  {activePlayers.length === 0 && <p className="emptyState">Adiciona jogadores primeiro.</p>}
                </ul>
                {gkWarning && <p className="warningText">{gkWarning}</p>}
                <button
                  className="btn btnPrimary"
                  disabled={g.convocados.length < 2}
                  onClick={onGerarEquipas}
                >
                  Gerar equipas equilibradas
                </button>
              </>
            )}

            {(g.status === "equipas" || g.status === "jogo" || g.status === "votacao" || g.status === "finalizado") && (
              <>
                <h3>Equipas</h3>
                {g.status === "equipas" && (
                  <p className="hint">
                    Achas as equipas desequilibradas? Toca num jogador e depois noutro da equipa
                    contrária para trocarem de lado (funciona também por arrastar, no computador).
                  </p>
                )}
                <div className="teamsRow">
                  <TeamColumn
                    label="Pretos"
                    accent="teamA"
                    ids={g.teamA}
                    playerName={playerName}
                    players={players}
                    rankingMap={rankingMap}
                    editable={g.status === "equipas"}
                    selectedSwap={selectedSwap}
                    onTapPlayer={handlePlayerTap}
                    onSwap={onSwap}
                  />
                  <TeamColumn
                    label="Brancos"
                    accent="teamB"
                    ids={g.teamB}
                    playerName={playerName}
                    players={players}
                    rankingMap={rankingMap}
                    editable={g.status === "equipas"}
                    selectedSwap={selectedSwap}
                    onTapPlayer={handlePlayerTap}
                    onSwap={onSwap}
                  />
                </div>
                {g.status === "equipas" && (
                  <button className="btn btnPrimary" onClick={onGoToResultado}>
                    Registar resultado
                  </button>
                )}
              </>
            )}

            {(g.status === "jogo" || g.status === "votacao" || g.status === "finalizado") && (
              <>
                <h3>Resultado</h3>
                <div className="scoreRow">
                  <span className="scoreTeamLabel teamA">Pretos</span>
                  <LocalNumberInput
                    className="input scoreInput"
                    min="0"
                    disabled={g.status !== "jogo"}
                    value={g.score.a}
                    onCommit={(v) => onSetScore("a", v)}
                  />
                  <span className="scoreDash">—</span>
                  <LocalNumberInput
                    className="input scoreInput"
                    min="0"
                    disabled={g.status !== "jogo"}
                    value={g.score.b}
                    onCommit={(v) => onSetScore("b", v)}
                  />
                  <span className="scoreTeamLabel teamB">Brancos</span>
                </div>

                <h3>Golos e assistências</h3>
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Jogador</th>
                        <th>Golos</th>
                        <th>Assistências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.convocados.map((pid) => (
                        <tr key={pid}>
                          <td>{playerName(pid)}</td>
                          <td>
                            <LocalNumberInput
                              className="input statInput"
                              min="0"
                              disabled={g.status !== "jogo"}
                              value={(g.stats[pid] && g.stats[pid].goals) || 0}
                              onCommit={(v) => onSetStat(pid, "goals", v)}
                            />
                          </td>
                          <td>
                            <LocalNumberInput
                              className="input statInput"
                              min="0"
                              disabled={g.status !== "jogo"}
                              value={(g.stats[pid] && g.stats[pid].assists) || 0}
                              onCommit={(v) => onSetStat(pid, "assists", v)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {g.status === "jogo" && (
                  <button className="btn btnPrimary" onClick={onOpenVoting}>
                    Confirmar resultado e abrir votação MVP (24h)
                  </button>
                )}

                {(g.status === "votacao" || g.status === "finalizado") && (
                  <>
                    <h3>Votação MVP</h3>
                    {g.status === "votacao" && (
                      <p className="votingTimer">
                        {votingLocked
                          ? "Prazo terminado — a fechar a votação…"
                          : `Aberta até ${formatDateTimePT(g.votingDeadline)} · ${formatRemaining(g.votingDeadline)}`}
                      </p>
                    )}

                    {g.status === "finalizado" ? (
                      <>
                        <p className="mvpResult">
                          {mvpWinners.length === 0
                            ? "Sem votos registados."
                            : mvpWinners.length === 1
                            ? `MVP: ${playerName(mvpWinners[0])} (${maxVotes} ${maxVotes === 1 ? "voto" : "votos"})`
                            : `MVP partilhado: ${mvpWinners.map(playerName).join(", ")} (${maxVotes} votos cada, mesmo após desempate)`}
                        </p>
                        {Object.keys(mvpTally).filter((pid) => !mvpWinners.includes(pid)).length > 0 && (
                          <ul className="otherVotesList">
                            {Object.entries(mvpTally)
                              .filter(([pid]) => !mvpWinners.includes(pid))
                              .sort((a, b) => b[1] - a[1])
                              .map(([pid, count]) => (
                                <li key={pid}>
                                  {playerName(pid)} — {count} {count === 1 ? "voto" : "votos"}
                                </li>
                              ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="hint">
                          Passem o telemóvel: cada convocado toca em "Votar" na própria linha, escolhe um colega
                          (não se pode votar em si próprio) e confirma.
                        </p>
                        <ul className="voteList">
                          {g.convocados.map((pid) => {
                            const voted = g.mvpVotes.some((v) => v.voterId === pid);
                            return (
                              <li key={pid} className="voteRow">
                                <span>{playerName(pid)}</span>
                                {voted ? (
                                  <span className="votedTag">✔ votou</span>
                                ) : votingAs === pid ? (
                                  <span className="voteFormInline">
                                    <select
                                      className="input"
                                      value={voteChoice || ""}
                                      onChange={(e) => setVoteChoice(e.target.value)}
                                    >
                                      <option value="">Escolhe o MVP…</option>
                                      {g.convocados
                                        .filter((otherId) => otherId !== pid)
                                        .map((otherId) => (
                                          <option key={otherId} value={otherId}>
                                            {playerName(otherId)}
                                          </option>
                                        ))}
                                    </select>
                                    <button
                                      className="btn btnPrimary"
                                      disabled={!voteChoice}
                                      onClick={() => onSubmitVote(pid, voteChoice)}
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      className="btn btnGhost"
                                      onClick={() => {
                                        setVotingAs(null);
                                        setVoteChoice(null);
                                      }}
                                    >
                                      Cancelar
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    className="btn btnGhost"
                                    onClick={() => {
                                      setVotingAs(pid);
                                      setVoteChoice(null);
                                    }}
                                  >
                                    Votar
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        <p className="hint">
                          {g.mvpVotes.length} de {g.convocados.length} já votaram. Só se vê o resultado final — nunca
                          em quem cada pessoa votou.
                        </p>
                      </>
                    )}
                  </>
                )}

                {g.status === "votacao" && (
                  <button className="btn btnGhost" onClick={onFinalize}>
                    Terminar votação agora
                  </button>
                )}
                {(g.status === "votacao" || g.status === "finalizado") && (
                  <button className="btn btnGhost" onClick={onReopen}>
                    Reabrir para corrigir resultado
                  </button>
                )}
              </>
            )}

            <div className="dangerZone">
              {confirmRemoveId === g.id ? (
                <>
                  <span>Apagar este jogo?</span>
                  <button className="btn btnDanger" onClick={onRemoveGame}>
                    Confirmar
                  </button>
                  <button className="btn btnGhost" onClick={() => setConfirmRemoveId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="btn btnGhost" onClick={() => setConfirmRemoveId(g.id)}>
                  Apagar jogo
                </button>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }

  function TeamColumn({ label, accent, ids, playerName, players, rankingMap, editable, selectedSwap, onTapPlayer, onSwap }) {
    const totalValue = ids.reduce((s, pid) => s + marketValue(balancingScore(pid, rankingMap)), 0);

    return (
      <div className={"teamCol " + accent}>
        <div className="teamColHeader">
          {label}
          <span className="teamAvg">{formatMarketValue(totalValue)}</span>
        </div>
        <ul className="teamPlayerList">
          {ids.map((pid) => {
            const p = players.find((x) => x.id === pid);
            const selected = selectedSwap === pid;
            return (
              <li
                key={pid}
                className={"teamPlayerRow" + (editable ? " teamPlayerEditable" : "") + (selected ? " teamPlayerSelected" : "")}
                draggable={editable}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", pid)}
                onDragOver={(e) => editable && e.preventDefault()}
                onDrop={(e) => {
                  if (!editable) return;
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData("text/plain");
                  if (draggedId && draggedId !== pid) onSwap(draggedId, pid);
                }}
                onClick={() => onTapPlayer(pid)}
              >
                <span>
                  {playerName(pid)}
                  {p && p.isGK && <span className="tagGK">GR</span>}
                </span>
                {editable && <span className="dragHandle">⠿</span>}
              </li>
            );
          })}
          {ids.length === 0 && <li className="emptyState">—</li>}
        </ul>
      </div>
    );
  }

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }

.app {
  font-family: 'Inter', sans-serif;
  background: #14211D;
  color: #F2EFE4;
  min-height: 100vh;
  padding: 0 0 3rem 0;
}

.loadingScreen {
  padding: 4rem 1.5rem;
  text-align: center;
  color: #B7C4BB;
  font-size: 1.1rem;
}

.header {
  padding: 2rem 1.5rem 1rem 1.5rem;
  border-bottom: 1px solid #2A3831;
}

.wordmark {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 2.6rem;
  letter-spacing: 0.02em;
  color: #E8A33D;
  line-height: 1.05;
}

.tagline {
  color: #93A399;
  margin-top: 0.35rem;
  font-size: 0.95rem;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #2A3831;
  position: sticky;
  top: 0;
  background: #14211D;
  z-index: 10;
}

.navBtn {
  background: none;
  border: none;
  color: #93A399;
  font-family: 'Inter', sans-serif;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.navBtn:hover { color: #F2EFE4; }

.navBtnActive {
  color: #E8A33D;
  border-bottom: 2px solid #E8A33D;
}

.errorBar {
  background: #4A2420;
  color: #F0BDB2;
  padding: 0.6rem 1.5rem;
  font-size: 0.9rem;
}

.main {
  padding: 1.5rem;
  max-width: 900px;
  margin: 0 auto;
}

.panel h2 {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.6rem;
  letter-spacing: 0.03em;
  color: #F2EFE4;
  margin: 0 0 0.75rem 0;
}

.panel h3 {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.15rem;
  letter-spacing: 0.02em;
  color: #D8CFB8;
  margin: 1.25rem 0 0.5rem 0;
}

.card {
  background: #1C2A24;
  border: 1px solid #2A3831;
  border-radius: 6px;
  padding: 1.25rem;
  margin-bottom: 1.25rem;
}

.cardHeaderRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.fieldRow {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.fieldGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field label {
  font-size: 0.8rem;
  color: #93A399;
}

.input {
  background: #14211D;
  border: 1px solid #354A40;
  color: #F2EFE4;
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
}

.input:focus {
  outline: 2px solid #E8A33D;
  outline-offset: 1px;
}

.checkboxLabel {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: #D8CFB8;
}

.btn {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0.5rem 0.9rem;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btnPrimary {
  background: #E8A33D;
  color: #14211D;
}

.btnPrimary:hover:not(:disabled) { background: #F2B457; }

.btnGhost {
  background: transparent;
  border: 1px solid #354A40;
  color: #D8CFB8;
}

.btnGhost:hover { border-color: #E8A33D; color: #E8A33D; }

.btnDanger {
  background: #B24C3D;
  color: #F2EFE4;
}

.btnTiny { padding: 0.25rem 0.5rem; font-size: 0.75rem; }

.playerList, .convocaList, .voteList, .teamPlayerList, .gameList {
  list-style: none;
  padding: 0;
  margin: 0;
}

.playerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0;
  border-bottom: 1px dashed #2A3831;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.playerInactive { opacity: 0.5; }

.playerName { display: flex; align-items: center; gap: 0.4rem; }

.playerActions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

.tagGK {
  background: #2E8B87;
  color: #F2EFE4;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  margin-left: 0.3rem;
}

.tagInactive {
  background: #354A40;
  color: #93A399;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  margin-left: 0.3rem;
}

.emptyState { color: #6E7D73; font-style: italic; padding: 0.5rem 0; }

.hint { color: #6E7D73; font-size: 0.82rem; margin-top: 0.5rem; }

.warningText { color: #E8A33D; font-size: 0.85rem; font-weight: 600; margin-top: 0.4rem; }

.gameCard {
  background: #1C2A24;
  border: 1px solid #2A3831;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.gameCardHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1.1rem;
  cursor: pointer;
}

.gameDate { color: #93A399; font-size: 0.85rem; margin-left: 0.5rem; }

.gameStatusRow { display: flex; align-items: center; gap: 0.6rem; }

.statusPill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  text-transform: lowercase;
}

.status-setup { background: #354A40; color: #D8CFB8; }
.status-equipas { background: #3A4A66; color: #C9D6F0; }
.status-jogo { background: #6B5423; color: #F2C97D; }
.status-finalizado { background: #2E5138; color: #9AD6AE; }

.chevron { color: #93A399; }

.gameCardBody {
  padding: 0 1.1rem 1.1rem 1.1rem;
  border-top: 1px solid #2A3831;
}

.teamsRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.teamCol {
  border-radius: 4px;
  padding: 0.75rem;
  border: 1px solid #2A3831;
}

.teamCol.teamA { border-left: 3px solid #E8A33D; }
.teamCol.teamB { border-left: 3px solid #2E8B87; }

.teamColHeader {
  font-weight: 700;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.teamAvg { font-weight: 400; color: #93A399; font-size: 0.75rem; }

.teamPlayerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3rem 0;
  font-size: 0.88rem;
}

.teamPlayerEditable {
  cursor: pointer;
  border-radius: 4px;
  padding: 0.3rem 0.4rem;
  margin: 0.1rem 0;
}

.teamPlayerEditable:hover { background: #24352C; }

.teamPlayerSelected {
  background: #3A4A2C;
  outline: 1px dashed #E8A33D;
}

.dragHandle { color: #4C5D53; font-size: 0.9rem; cursor: grab; }

.scoreRow {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.scoreInput { width: 60px; text-align: center; font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; }

.scoreDash { color: #93A399; }

.scoreTeamLabel { font-size: 0.8rem; font-weight: 700; }
.scoreTeamLabel.teamA { color: #E8A33D; }
.scoreTeamLabel.teamB { color: #2E8B87; }

.statInput { width: 55px; }

.tableWrap { overflow-x: auto; }

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.table th {
  text-align: left;
  color: #93A399;
  font-weight: 600;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid #354A40;
  white-space: nowrap;
}

.table td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px dashed #2A3831;
}

.scoreCell { font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem; color: #E8A33D; }

.rowInactive { opacity: 0.5; }

.voteRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px dashed #2A3831;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.votedTag { color: #9AD6AE; font-size: 0.85rem; }

.voteFormInline { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }

.mvpResult { color: #F2C97D; font-weight: 600; }

.otherVotesList {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0 0;
  color: #93A399;
  font-size: 0.85rem;
}

.otherVotesList li {
  padding: 0.2rem 0;
}

.votingTimer {
  color: #F2C97D;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.presetRow { display: flex; gap: 0.5rem; flex-wrap: wrap; }



.dangerZone {
  margin-top: 1.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #2A3831;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #93A399;
}

@media (max-width: 560px) {
  .teamsRow { grid-template-columns: 1fr; }
  .wordmark { font-size: 1.8rem; }
}
`;
