-- Caminho local no servidor Linux para acessar os PDFs de NF
-- (ponto de montagem CIFS, ex: /mnt/sisplan/NFe/LOG_001/DANFE)
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_local_path TEXT;
