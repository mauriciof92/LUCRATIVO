-- Criar tabela trigger_suggestions para armazenar avaliações do motor Poisson
-- Execute este SQL no SQL Editor do Supabase

create table if not exists trigger_suggestions (
  id              uuid default gen_random_uuid() primary key,
  fixture_id      text,
  match_label     text,
  market_id       text,
  data_mode       text,
  lambda_home     numeric,
  lambda_away     numeric,
  lambda_total    numeric,
  model_prob      numeric,
  implied_prob    numeric,
  fair_odd        numeric,
  captured_odd    numeric,   -- preencher depois (CLV)
  edge_pct        numeric,
  confidence_score int,
  status          text,
  reason_codes    text[],
  closing_odd     numeric,   -- preencher depois (CLV)
  created_at      timestamptz default now()
);

-- Criar índices para performance
create index on trigger_suggestions (fixture_id);
create index on trigger_suggestions (status);
create index on trigger_suggestions (created_at);
create index on trigger_suggestions (market_id);

-- Comentários para documentação
comment on table trigger_suggestions is 'Armazena avaliações do motor Poisson para análise histórica';
comment on column trigger_suggestions.fixture_id is 'ID do fixture da API-Football';
comment on column trigger_suggestions.match_label is 'Nome do jogo (Time A x Time B)';
comment on column trigger_suggestions.market_id is 'ID do mercado (OVER_05_HT, OVER_15_FT, etc)';
comment on column trigger_suggestions.data_mode is 'Modo dos dados: csv_only ou csv_plus_api';
comment on column trigger_suggestions.lambda_home is 'Lambda Poisson time da casa';
comment on column trigger_suggestions.lambda_away is 'Lambda Poisson time visitante';
comment on column trigger_suggestions.lambda_total is 'Lambda Poisson total';
comment on column trigger_suggestions.model_prob is 'Probabilidade calculada pelo modelo';
comment on column trigger_suggestions.implied_prob is 'Probabilidade implícita pela odd';
comment on column trigger_suggestions.fair_odd is 'Odd justa calculada';
comment on column trigger_suggestions.captured_odd is 'Odd capturada no momento da aposta';
comment on column trigger_suggestions.edge_pct is 'Edge percentual (modelProb - impliedProb) * 100';
comment on column trigger_suggestions.confidence_score is 'Score de confiança 0-100';
comment on column trigger_suggestions.status is 'Status: APPROVED, REVIEW, BLOCKED';
comment on column trigger_suggestions.reason_codes is 'Códigos de motivo da decisão';
comment on column trigger_suggestions.closing_odd is 'Odd de fechamento para cálculo CLV';
