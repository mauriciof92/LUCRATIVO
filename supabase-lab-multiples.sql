-- Criar tabela lab_multiples para o Laboratório de Múltiplas
-- Execute este SQL no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS lab_multiples (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  type varchar(50) NOT NULL, -- 'CORRECT_SCORE', 'MATCH_ODDS_VAR_1', 'MATCH_ODDS_VAR_2', 'MATCH_ODDS_VAR_3'
  legs jsonb NOT NULL, -- Array com os jogos, seleções, probs e fair odds
  combined_prob numeric NOT NULL,
  combined_fair_odd numeric NOT NULL,
  actual_odd_taken numeric, -- Onde o usuário anotará a odd que conseguiu na casa
  status varchar(20) DEFAULT 'PENDING' -- PENDING, WON, LOST
);

-- Criar índices para performance
CREATE INDEX ON lab_multiples (type);
CREATE INDEX ON lab_multiples (status);
CREATE INDEX ON lab_multiples (created_at);

-- Comentários para documentação
COMMENT ON TABLE lab_multiples IS 'Armazena múltiplas geradas no Laboratório de Múltiplas para auditoria';
COMMENT ON COLUMN lab_multiples.type IS 'Tipo da múltipla: CORRECT_SCORE ou MATCH_ODDS_VAR_X';
COMMENT ON COLUMN lab_multiples.legs IS 'Array JSON com as pernas da múltipla (jogos, seleções, probabilidades)';
COMMENT ON COLUMN lab_multiples.combined_prob IS 'Probabilidade combinada (produto das probabilidades individuais)';
COMMENT ON COLUMN lab_multiples.combined_fair_odd IS 'Odd justa combinada (1 / probabilidade combinada)';
COMMENT ON COLUMN lab_multiples.actual_odd_taken IS 'Odd real obtida na casa de apostas (anotação manual)';
COMMENT ON COLUMN lab_multiples.status IS 'Status da múltipla: PENDING, WON, LOST';
