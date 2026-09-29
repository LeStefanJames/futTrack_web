-- Run this in the Supabase SQL Editor AFTER schema.sql, to load your existing
-- players/games from the exported backup instead of starting empty.

insert into app_state (id, data)
values (1, '{
  "players": [
    { "id": "mtshdr4gj4ourp", "name": "Stefanmaier", "isGK": false, "active": true },
    { "id": "mtshi835t0j7ic", "name": "Marcolino", "isGK": false, "active": true },
    { "id": "mtshijwg3w4qq7", "name": "Zé Filipe", "isGK": false, "active": true },
    { "id": "mtshitqmcqr83y", "name": "Sérgio", "isGK": false, "active": true },
    { "id": "mtshj4frtidwl6", "name": "Jimmy", "isGK": false, "active": true },
    { "id": "mtshj6zphm3iw4", "name": "Richie", "isGK": false, "active": true },
    { "id": "mtshjaz4qcinvv", "name": "Mario", "isGK": false, "active": true },
    { "id": "mtshjeguwkkgio", "name": "Tonio", "isGK": false, "active": true },
    { "id": "mtshjm6yr26nof", "name": "Gabi", "isGK": false, "active": true },
    { "id": "mtshjr34t2m49j", "name": "Pedro Soares jr", "isGK": false, "active": true },
    { "id": "mtshjw7clq5866", "name": "Marco Sampaio", "isGK": true, "active": true },
    { "id": "mtshk5sz6uw2aa", "name": "Quim", "isGK": false, "active": true },
    { "id": "mtshk7kl4m7rk4", "name": "Celo", "isGK": false, "active": true },
    { "id": "mtshk9dmxbh4gy", "name": "Nelo", "isGK": false, "active": true },
    { "id": "mu1aaj54anqawh", "name": "Bruno T", "isGK": false, "active": true },
    { "id": "mueb00sxt74pf5", "name": "Tiago N", "isGK": false, "active": true }
  ],
  "games": [
    {
      "id": "mukd9ghw74rb8c",
      "label": "28/09/2026",
      "date": "2026-09-28",
      "status": "jogo",
      "convocados": ["mtshdr4gj4ourp", "mtshi835t0j7ic", "mtshitqmcqr83y", "mtshj6zphm3iw4", "mtshjaz4qcinvv", "mtshjr34t2m49j", "mtshk5sz6uw2aa", "mtshk9dmxbh4gy", "mtshk7kl4m7rk4", "mu1aaj54anqawh"],
      "teamA": ["mtshdr4gj4ourp", "mu1aaj54anqawh", "mtshitqmcqr83y", "mtshjaz4qcinvv", "mtshi835t0j7ic"],
      "teamB": ["mtshk5sz6uw2aa", "mtshj6zphm3iw4", "mtshk7kl4m7rk4", "mtshjr34t2m49j", "mtshk9dmxbh4gy"],
      "score": { "a": 0, "b": 0 },
      "stats": {},
      "mvpVotes": [],
      "votingDeadline": null
    },
    {
      "id": "mueb02i0o6hzvr",
      "label": "23/09/2026",
      "date": "2026-09-23",
      "status": "finalizado",
      "convocados": ["mtshdr4gj4ourp", "mtshi835t0j7ic", "mtshijwg3w4qq7", "mtshitqmcqr83y", "mtshj6zphm3iw4", "mtshjaz4qcinvv", "mtshjr34t2m49j", "mtshk5sz6uw2aa", "mu1aaj54anqawh", "mueb00sxt74pf5"],
      "teamA": ["mtshdr4gj4ourp", "mtshitqmcqr83y", "mueb00sxt74pf5", "mtshijwg3w4qq7", "mtshi835t0j7ic"],
      "teamB": ["mtshj6zphm3iw4", "mtshjaz4qcinvv", "mtshk5sz6uw2aa", "mtshjr34t2m49j", "mu1aaj54anqawh"],
      "score": { "a": 11, "b": 9 },
      "stats": {
        "mtshdr4gj4ourp": { "goals": 2, "assists": 1 },
        "mtshi835t0j7ic": { "goals": 1, "assists": 2 },
        "mtshijwg3w4qq7": { "goals": 2, "assists": 2 },
        "mtshitqmcqr83y": { "goals": 0, "assists": 2 },
        "mtshj6zphm3iw4": { "goals": 2, "assists": 0 },
        "mtshjaz4qcinvv": { "goals": 1, "assists": 1 },
        "mtshjr34t2m49j": { "goals": 3, "assists": 0 },
        "mu1aaj54anqawh": { "goals": 3, "assists": 3 },
        "mueb00sxt74pf5": { "goals": 5, "assists": 1 }
      },
      "mvpVotes": [
        { "voterId": "mtshdr4gj4ourp", "votedForId": "mu1aaj54anqawh" },
        { "voterId": "mtshjaz4qcinvv", "votedForId": "mtshjr34t2m49j" },
        { "voterId": "mtshitqmcqr83y", "votedForId": "mueb00sxt74pf5" },
        { "voterId": "mtshi835t0j7ic", "votedForId": "mueb00sxt74pf5" },
        { "voterId": "mtshk5sz6uw2aa", "votedForId": "mu1aaj54anqawh" },
        { "voterId": "mtshijwg3w4qq7", "votedForId": "mueb00sxt74pf5" },
        { "voterId": "mu1aaj54anqawh", "votedForId": "mueb00sxt74pf5" },
        { "voterId": "mtshj6zphm3iw4", "votedForId": "mueb00sxt74pf5" }
      ],
      "votingDeadline": "2026-09-24T18:20:05.389Z"
    },
    {
      "id": "mu9tnpxmfid90h",
      "label": "21/09/2026",
      "date": "2026-09-21",
      "status": "finalizado",
      "convocados": ["mtshdr4gj4ourp", "mtshi835t0j7ic", "mtshijwg3w4qq7", "mtshitqmcqr83y", "mtshjaz4qcinvv", "mtshj6zphm3iw4", "mtshk5sz6uw2aa", "mtshk7kl4m7rk4", "mtshk9dmxbh4gy", "mu1aaj54anqawh"],
      "teamA": ["mtshitqmcqr83y", "mtshjaz4qcinvv", "mtshijwg3w4qq7", "mu1aaj54anqawh", "mtshi835t0j7ic"],
      "teamB": ["mtshdr4gj4ourp", "mtshj6zphm3iw4", "mtshk5sz6uw2aa", "mtshk9dmxbh4gy", "mtshk7kl4m7rk4"],
      "score": { "a": 8, "b": 11 },
      "stats": {
        "mtshdr4gj4ourp": { "goals": 4, "assists": 2 },
        "mtshi835t0j7ic": { "goals": 3, "assists": 0 },
        "mtshijwg3w4qq7": { "goals": 1, "assists": 1 },
        "mtshitqmcqr83y": { "goals": 0, "assists": 1 },
        "mtshjaz4qcinvv": { "goals": 2, "assists": 2 },
        "mtshj6zphm3iw4": { "goals": 0, "assists": 2 },
        "mtshk5sz6uw2aa": { "goals": 2, "assists": 3 },
        "mtshk7kl4m7rk4": { "goals": 2, "assists": 1 },
        "mtshk9dmxbh4gy": { "goals": 3, "assists": 0 },
        "mu1aaj54anqawh": { "goals": 2, "assists": 1 }
      },
      "mvpVotes": [
        { "voterId": "mtshdr4gj4ourp", "votedForId": "mu1aaj54anqawh" },
        { "voterId": "mtshi835t0j7ic", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshjaz4qcinvv", "votedForId": "mu1aaj54anqawh" },
        { "voterId": "mtshk5sz6uw2aa", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshijwg3w4qq7", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mu1aaj54anqawh", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshk7kl4m7rk4", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshk9dmxbh4gy", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshj6zphm3iw4", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshitqmcqr83y", "votedForId": "mtshk5sz6uw2aa" }
      ],
      "votingDeadline": "2026-09-22T22:33:19.797Z"
    },
    {
      "id": "mu1aalrhtblkdf",
      "label": "14/09/2026",
      "date": "2026-09-14",
      "status": "finalizado",
      "convocados": ["mtshdr4gj4ourp", "mtshi835t0j7ic", "mtshitqmcqr83y", "mtshj4frtidwl6", "mtshj6zphm3iw4", "mtshjaz4qcinvv", "mtshjm6yr26nof", "mtshjr34t2m49j", "mu1aaj54anqawh", "mtshk7kl4m7rk4"],
      "teamA": ["mtshdr4gj4ourp", "mtshj4frtidwl6", "mtshk7kl4m7rk4", "mtshi835t0j7ic", "mtshjm6yr26nof"],
      "teamB": ["mtshitqmcqr83y", "mtshj6zphm3iw4", "mu1aaj54anqawh", "mtshjr34t2m49j", "mtshjaz4qcinvv"],
      "score": { "a": 8, "b": 9 },
      "stats": {
        "mtshdr4gj4ourp": { "goals": 2, "assists": 4 },
        "mtshi835t0j7ic": { "goals": 3, "assists": 0 },
        "mtshj4frtidwl6": { "goals": 1, "assists": 0 },
        "mtshjm6yr26nof": { "goals": 1, "assists": 1 },
        "mtshk7kl4m7rk4": { "goals": 1, "assists": 3 },
        "mtshjaz4qcinvv": { "goals": 2, "assists": 5 },
        "mtshjr34t2m49j": { "goals": 4, "assists": 0 },
        "mtshj6zphm3iw4": { "goals": 0, "assists": 2 },
        "mu1aaj54anqawh": { "goals": 1, "assists": 1 },
        "mtshitqmcqr83y": { "goals": 2, "assists": 0 }
      },
      "mvpVotes": [
        { "voterId": "mtshj4frtidwl6", "votedForId": "mtshjaz4qcinvv" },
        { "voterId": "mu1aaj54anqawh", "votedForId": "mtshjaz4qcinvv" },
        { "voterId": "mtshdr4gj4ourp", "votedForId": "mu1aaj54anqawh" },
        { "voterId": "mtshjaz4qcinvv", "votedForId": "mtshjr34t2m49j" },
        { "voterId": "mtshk7kl4m7rk4", "votedForId": "mtshjaz4qcinvv" },
        { "voterId": "mtshjm6yr26nof", "votedForId": "mtshk7kl4m7rk4" },
        { "voterId": "mtshi835t0j7ic", "votedForId": "mtshjaz4qcinvv" },
        { "voterId": "mtshjr34t2m49j", "votedForId": "mtshjaz4qcinvv" },
        { "voterId": "mtshj6zphm3iw4", "votedForId": "mu1aaj54anqawh" },
        { "voterId": "mtshitqmcqr83y", "votedForId": "mtshjr34t2m49j" }
      ],
      "votingDeadline": "2026-09-15T23:06:00.417Z"
    },
    {
      "id": "mtshkjcgj139dm",
      "label": "07/09/2026",
      "date": "2026-09-08",
      "status": "finalizado",
      "convocados": ["mtshdr4gj4ourp", "mtshi835t0j7ic", "mtshijwg3w4qq7", "mtshitqmcqr83y", "mtshj4frtidwl6", "mtshj6zphm3iw4", "mtshjaz4qcinvv", "mtshjeguwkkgio", "mtshjm6yr26nof", "mtshjr34t2m49j"],
      "teamA": ["mtshdr4gj4ourp", "mtshijwg3w4qq7", "mtshj4frtidwl6", "mtshitqmcqr83y", "mtshj6zphm3iw4"],
      "teamB": ["mtshjm6yr26nof", "mtshjaz4qcinvv", "mtshi835t0j7ic", "mtshjeguwkkgio", "mtshjr34t2m49j"],
      "score": { "a": 9, "b": 6 },
      "stats": {
        "mtshdr4gj4ourp": { "goals": 4, "assists": 1 },
        "mtshi835t0j7ic": { "goals": 1, "assists": 0 },
        "mtshjaz4qcinvv": { "goals": 1, "assists": 2 },
        "mtshitqmcqr83y": { "goals": 1, "assists": 2 },
        "mtshijwg3w4qq7": { "goals": 3, "assists": 2 },
        "mtshj6zphm3iw4": { "goals": 1, "assists": 1 },
        "mtshj4frtidwl6": { "goals": 0, "assists": 1 },
        "mtshjm6yr26nof": { "goals": 1, "assists": 1 },
        "mtshjr34t2m49j": { "goals": 3, "assists": 2 }
      },
      "mvpVotes": [
        { "voterId": "mtshdr4gj4ourp", "votedForId": "mtshijwg3w4qq7" },
        { "voterId": "mtshi835t0j7ic", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshijwg3w4qq7", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshitqmcqr83y", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshj6zphm3iw4", "votedForId": "mtshi835t0j7ic" },
        { "voterId": "mtshjaz4qcinvv", "votedForId": "mtshjr34t2m49j" },
        { "voterId": "mtshjeguwkkgio", "votedForId": "mtshdr4gj4ourp" },
        { "voterId": "mtshjr34t2m49j", "votedForId": "mtshjaz4qcinvv" }
      ],
      "votingDeadline": "2026-09-15T13:32:40.449Z"
    }
  ],
  "config": {
    "weights": { "win": 3, "draw": 1, "loss": 2, "goal": 0.5, "assist": 0.4, "mvp": 2 },
    "confidenceGames": 5
  }
}'::jsonb)
on conflict (id) do update set data = excluded.data;
