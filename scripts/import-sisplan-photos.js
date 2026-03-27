#!/usr/bin/env node
/**
 * Importa fotos de produtos do share Sisplan para uploads/product-photos/
 *
 * Pré-requisito: montar o share no Mac via Finder (Cmd+K → smb://192.168.7.2/Sisplan)
 *
 * Uso:
 *   node scripts/import-sisplan-photos.js
 *   node scripts/import-sisplan-photos.js --source /Volumes/Sisplan/fotos
 */

const fs = require('fs');
const path = require('path');

const SOURCE = process.argv.includes('--source')
  ? process.argv[process.argv.indexOf('--source') + 1]
  : '/Volumes/Sisplan/fotos';

const DEST = path.join(__dirname, '../apps/server/uploads/product-photos');

if (!fs.existsSync(SOURCE)) {
  console.error(`\n❌ Pasta de origem não encontrada: ${SOURCE}`);
  console.error('   Monte o share via Finder: Cmd+K → smb://192.168.7.2/Sisplan\n');
  process.exit(1);
}

if (!fs.existsSync(DEST)) {
  fs.mkdirSync(DEST, { recursive: true });
  console.log(`📁 Criado: ${DEST}`);
}

const files = fs.readdirSync(SOURCE).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));

if (files.length === 0) {
  console.error(`❌ Nenhuma imagem encontrada em ${SOURCE}`);
  process.exit(1);
}

console.log(`\n📷 ${files.length} imagens encontradas. Copiando...\n`);

let copied = 0;
let skipped = 0;

for (const file of files) {
  const src = path.join(SOURCE, file);
  const dest = path.join(DEST, file.toLowerCase()); // normaliza para minúsculas

  if (fs.existsSync(dest)) {
    const srcStat = fs.statSync(src);
    const destStat = fs.statSync(dest);
    if (srcStat.size === destStat.size) {
      skipped++;
      continue;
    }
  }

  fs.copyFileSync(src, dest);
  copied++;
  if (copied % 50 === 0) process.stdout.write(`  ${copied}/${files.length}...\n`);
}

console.log(`\n✅ Concluído!`);
console.log(`   Copiadas: ${copied}`);
console.log(`   Ignoradas (já existiam): ${skipped}`);
console.log(`   Destino: ${DEST}\n`);
