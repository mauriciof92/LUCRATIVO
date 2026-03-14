-- Tabela: processed_games
-- Propósito: Armazenar jogos processados pelo Motor Único (Fase 2)
-- Benefícios: Frontend apenas lê, sem processamento pesado

CREATE TABLE IF NOT EXISTS processed_games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    fixture_id INTEGER NOT NULL,           -- ID da API-Football
    match TEXT NOT NULL,                   -- "Time A x Time B"
    home TEXT NOT NULL,                   -- Time da casa
    away TEXT NOT NULL,                   -- Time visitante
    league TEXT NOT NULL,                 -- Liga/Campeonato
    hour TEXT NOT NULL,                   -- Horário do jogo
    status TEXT NOT NULL,                  -- NS/FT/POSTPONED
    
    -- 🆕 Dados do Motor Poisson (processados no servidor)
    profile TEXT NOT NULL,                 -- shootout_btts, dominant, etc.
    score REAL NOT NULL,                   -- 0.0 a 1.0
    confidence REAL NOT NULL,              -- 0.0 a 1.0
    
    -- 🆕 Mercados gerados
    mainMarket JSONB,                     -- Mercado principal
    combo JSONB,                          -- Combo de mercados
    
    -- 🆕 Dados brutos para compatibilidade
    rowValues JSONB,                      -- Array de strings do CSV
    oddsMap JSONB DEFAULT '{}',           -- Odds em tempo real (preenchido no frontend)
    
    -- 🆕 Dados do favorito para mercados específicos
    favoriteTeam TEXT,                    -- Nome do time favorito
    afDiff REAL,                          -- Diferença de attack force
    chFavGol REAL,                        -- Chutes do favorito HT
    
    -- 🆕 Metadados
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- Quando foi processado
    
    -- Constraints
    UNIQUE(fixture_id, date),             -- Um jogo por data
    CHECK (score >= 0 AND score <= 1),    -- Score válido
    CHECK (confidence >= 0 AND confidence <= 1) -- Confiança válida
);

-- 🆕 Índices para performance
CREATE INDEX IF NOT EXISTS idx_processed_games_date ON processed_games(date);
CREATE INDEX IF NOT EXISTS idx_processed_games_fixture_id ON processed_games(fixture_id);
CREATE INDEX IF NOT EXISTS idx_processed_games_profile ON processed_games(profile);
CREATE INDEX IF NOT EXISTS idx_processed_games_confidence ON processed_games(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_processed_games_score ON processed_games(score DESC);

-- 🆕 Políticas de RLS (Row Level Security)
ALTER TABLE processed_games ENABLE ROW LEVEL SECURITY;

-- Política: Usuários autenticados podem ler
CREATE POLICY "Users can read processed games" ON processed_games
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Serviço pode inserir/atualizar
CREATE POLICY "Service can manage processed games" ON processed_games
    FOR ALL USING (auth.role() = 'service_role');

-- 🆕 Comentários
COMMENT ON TABLE processed_games IS 'Jogos processados pelo Motor Poisson - Fase 2 da otimização';
COMMENT ON COLUMN processed_games.profile IS 'Perfil do jogo: shootout_btts, dominant, chutes_ht_fav, corner_dominant, high_offense_balanced, balanced_btts, low_goals, generic';
COMMENT ON COLUMN processed_games.score IS 'Score de qualidade (0-1) calculado pelo motor';
COMMENT ON COLUMN processed_games.confidence IS 'Confiança da análise (0-1) calculada pelo motor';
COMMENT ON COLUMN processed_games.mainMarket IS 'Mercado principal gerado (label, odd, prob, etc)';
COMMENT ON COLUMN processed_games.combo IS 'Combo de mercados gerados';
COMMENT ON COLUMN processed_games.evPct IS 'Expected Value percentual (calculado no frontend)';
