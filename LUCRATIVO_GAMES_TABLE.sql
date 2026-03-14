-- Tabela: lucrativo_games
-- Propósito: Tabela única centralizada para todos os jogos do sistema
-- Benefícios: Simplificação do schema, UPSERT eficiente, manutenção facilitada

CREATE TABLE IF NOT EXISTS lucrativo_games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- 🆕 Identificador Único do Jogo
    game_id TEXT NOT NULL UNIQUE,           -- Hash único: home+away+league+hour
    
    -- 📅 Informações Básicas
    date TEXT NOT NULL,                     -- YYYY-MM-DD
    hour TEXT NOT NULL,                     -- HH:MM
    league TEXT NOT NULL,                   -- Liga/Campeonato
    home TEXT NOT NULL,                    -- Time da casa
    away TEXT NOT NULL,                    -- Time visitante
    status TEXT DEFAULT 'pending',          -- pending/finished/postponed
    
    -- 📊 Estatísticas do Engine (mantidas do schema atual)
    exg REAL,                              -- Expected Goals
    exc REAL,                              -- Expected Corners
    cv REAL,                               -- Coeficiente de Variação
    
    -- 🎯 Attack Force (Home/Away)
    af_h REAL,                             -- Attack Force Home
    af_a REAL,                             -- Attack Force Away
    
    -- 🥅 Chutes (HT/Total - Home/Away)
    ch_hth REAL,                           -- Chutes HT Home
    ch_hta REAL,                           -- Chutes HT Away
    ch_toth REAL,                          -- Chutes Total Home
    ch_tota REAL,                          -- Chutes Total Away
    
    -- 🚩 Cantos (HT/FT - Home/Away)
    cant_hth REAL,                         -- Cantos HT Home
    cant_hta REAL,                         -- Cantos HT Away
    cant_fth REAL,                         -- Cantos FT Home
    cant_fta REAL,                         -- Cantos FT Away
    
    -- ⚽ Gol05 (HT - Home/Away)
    gol05_hth REAL,                        -- Gol05 HT Home
    gol05_hta REAL,                        -- Gol05 HT Away
    
    -- 🎯 Mercados Gerados (JSON)
    main_market JSONB,                     -- Mercado principal
    combo JSONB,                          -- Combo de mercados
    
    -- 🕐 Timestamps
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),   -- Quando foi importado
    resolved_at TIMESTAMP WITH TIME ZONE,               -- Quando foi resolvido
    
    -- 🆕 Campos Opcionais para Futuro
    fixture_id INTEGER,                    -- ID da API-Football (futuro)
    processed_at TIMESTAMP WITH TIME ZONE, -- Quando foi processado (futuro)
    
    -- Constraints
    CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),    -- Formato YYYY-MM-DD
    CHECK (hour ~ '^\d{2}:\d{2}$'),          -- Formato HH:MM
    CHECK (status IN ('pending', 'finished', 'postponed'))
);

-- 🆕 Índices para Performance
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_game_id ON lucrativo_games(game_id);
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_date ON lucrativo_games(date);
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_status ON lucrativo_games(status);
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_league ON lucrativo_games(league);
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_imported_at ON lucrativo_games(imported_at);

-- 🆕 Índices Compostos para Queries Comuns
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_date_status ON lucrativo_games(date, status);
CREATE INDEX IF NOT EXISTS idx_lucrativo_games_league_date ON lucrativo_games(league, date);

-- 🆕 Políticas de RLS (Row Level Security)
ALTER TABLE lucrativo_games ENABLE ROW LEVEL SECURITY;

-- Política: Usuários autenticados podem ler
CREATE POLICY "Users can read lucrativo games" ON lucrativo_games
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Serviço pode gerenciar jogos
CREATE POLICY "Service can manage lucrativo games" ON lucrativo_games
    FOR ALL USING (auth.role() = 'service_role');

-- 🆕 Comentários
COMMENT ON TABLE lucrativo_games IS 'Tabela única centralizada para todos os jogos do sistema LUCRATIVO';
COMMENT ON COLUMN lucrativo_games.game_id IS 'Hash único gerado por generateGameId(home, away, league, hour)';
COMMENT ON COLUMN lucrativo_games.status IS 'pending=aguardando resultado, finished=finalizado, postponed=adiado';
COMMENT ON COLUMN lucrativo_games.main_market IS 'Mercado principal gerado pelo engine (JSON)';
COMMENT ON COLUMN lucrativo_games.combo IS 'Combo de mercados gerados pelo engine (JSON)';
COMMENT ON COLUMN lucrativo_games.resolved_at IS 'Quando o jogo foi finalizado com resultado';
COMMENT ON COLUMN lucrativo_games.fixture_id IS 'ID da API-Football (para integração futura)';
COMMENT ON COLUMN lucrativo_games.processed_at IS 'Quando foi processado pelo Motor Único (futuro)';

-- 🆕 Exemplo de UPSERT Operation
-- INSERT INTO lucrativo_games (game_id, date, hour, league, home, away, exg, exc, cv)
-- VALUES ('abc123', '2026-03-14', '15:00', 'Premier League', 'Arsenal', 'Chelsea', 2.5, 10.2, 0.15)
-- ON CONFLICT (game_id) 
-- DO UPDATE SET 
--   exg = EXCLUDED.exg,
--   exc = EXCLUDED.exc,
--   cv = EXCLUDED.cv,
--   imported_at = NOW();
