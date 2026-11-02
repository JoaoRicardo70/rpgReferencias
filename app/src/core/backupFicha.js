// ==========================================
// 💾 BACKUP DA FICHA — lógica pura. Cópia diária na nuvem (últimos dias) + Exportar/Importar em arquivo .json, para uma ficha
// perdida (sobrescrita por uma cópia velha, apagada, trocada por engano) poder voltar. Nada aqui fala com o Firebase
// (services/backup-ficha.js) nem com a tela (components/perfil/BackupFichaPanel.jsx).
// ==========================================

export const LIMITE_BACKUPS = 20;            // (legado) teto total; a poda real é por tipo: ver chavesParaPodar
export const LIMITE_DIARIOS = 15;            // cópias diárias guardadas por personagem
export const LIMITE_ANTES_IMPORTAR = 5;      // cópias "antes de importar/restaurar" guardadas (não expulsam as diárias)
export const LIMITE_ARQUIVO_BYTES = 5 * 1024 * 1024; // arquivo de ficha maior que isto é recusado (o Firebase aceita ~16 MB por escrita)
export const LIMITE_IMAGEM_NO_BACKUP = 300000; // imagem embutida (data:) maior que isto (caracteres) não entra no backup da nuvem
export const TIPO_ARQUIVO = 'rpg-anime-system/ficha';
export const VERSAO_ARQUIVO = 1;

const dois = (n) => String(n).padStart(2, '0');

// 'AAAA-MM-DD' no relógio local (um backup por dia).
export function dataDeHoje(agora = new Date()) {
    return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

// Chave de um backup tirado antes de uma importação/restauração: 'AAAA-MM-DD_antes_HHMMSS'.
export function chaveAntesDeImportar(agora = new Date()) {
    return `${dataDeHoje(agora)}_antes_${dois(agora.getHours())}${dois(agora.getMinutes())}${dois(agora.getSeconds())}`;
}

export function rotuloDoBackup(chave) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:_antes_(\d{2})(\d{2})(\d{2}))?$/.exec(String(chave || ''));
    if (!m) return String(chave || '');
    const data = `${m[3]}/${m[2]}/${m[1]}`;
    return m[4] ? `${data} ${m[4]}:${m[5]} (antes de importar)` : data;
}

// Copia a ficha para o backup da nuvem. Imagens embutidas gigantes (data:...) ficam de fora para não estourar o banco; o resto vai inteiro.
// Devolve { ficha, imagensRemovidas }.
export function prepararBackup(ficha, limite = LIMITE_IMAGEM_NO_BACKUP) {
    let removidas = 0;
    const limpar = (v) => {
        if (typeof v === 'string') {
            if (v.length > limite && v.startsWith('data:')) { removidas++; return ''; }
            return v;
        }
        if (Array.isArray(v)) return v.map(limpar);
        if (v && typeof v === 'object') {
            const saida = {};
            Object.keys(v).forEach((k) => { saida[k] = limpar(v[k]); });
            return saida;
        }
        return v;
    };
    const copia = limpar(JSON.parse(JSON.stringify(ficha || {})));
    return { ficha: copia, imagensRemovidas: removidas };
}

const tamanho = (v) => (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0));

// Números que ajudam a reconhecer uma ficha (e a perceber uma ficha "menor" que a atual antes de substituir).
export function resumoDaFicha(ficha) {
    const f = ficha && typeof ficha === 'object' ? ficha : {};
    let bytes = 0;
    try { bytes = JSON.stringify(f).length; } catch (e) { bytes = 0; }
    return {
        poderes: tamanho(f.poderes),
        itens: tamanho(f.inventario),
        tecnicas: tamanho(f.ataquesElementais),
        formas: tamanho(f.formas) + tamanho(f.seresSelados),
        campos: Object.keys(f).length,
        kb: Math.round(bytes / 1024)
    };
}

export function descreverResumo(r) {
    return `${r.poderes} poder(es)/habilidade(s), ${r.itens} item(ns), ${r.tecnicas} técnica(s), ${r.kb} KB`;
}

// A ficha de `nova` é bem MENOR que a de `atual`? (sinal de que está trocando uma ficha cheia por uma antiga/vazia.)
export function pareceFichaMenor(atual, nova) {
    const a = resumoDaFicha(atual);
    const n = resumoDaFicha(nova);
    const pesoA = a.poderes + a.itens + a.tecnicas + a.formas;
    const pesoN = n.poderes + n.itens + n.tecnicas + n.formas;
    return pesoA >= 4 && pesoN < pesoA * 0.7;
}

export function nomeDoArquivo(nome, agora = new Date()) {
    const base = String(nome || 'ficha').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'ficha';
    return `ficha-${base}-${dataDeHoje(agora)}.json`;
}

export function montarArquivoExportacao(ficha, nome, agora = new Date()) {
    return {
        tipo: TIPO_ARQUIVO,
        versao: VERSAO_ARQUIVO,
        nome: String(nome || ''),
        exportadoEm: agora.toISOString(),
        ficha: JSON.parse(JSON.stringify(ficha || {}))
    };
}

// Lê o texto de um arquivo .json (do botão Importar). Aceita o arquivo exportado pelo app ou uma ficha "crua" (objeto com vida/bio/poderes...).
// Devolve { ok: true, ficha, nome, exportadoEm } ou { ok: false, erro }.
export function lerArquivoImportacao(texto) {
    let dados;
    try { dados = JSON.parse(String(texto || '')); } catch (e) { return { ok: false, erro: 'O arquivo não é um JSON válido.' }; }
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { ok: false, erro: 'O arquivo não parece uma ficha.' };
    const embrulhado = dados.tipo === TIPO_ARQUIVO && dados.ficha && typeof dados.ficha === 'object';
    const ficha = embrulhado ? dados.ficha : dados;
    if (Array.isArray(ficha) || !ehFichaPlausivel(ficha)) return { ok: false, erro: 'O arquivo não parece uma ficha deste app (faltam vida, bio ou poderes).' };
    if (temChaveInvalida(ficha)) return { ok: false, erro: 'O arquivo tem campos com nomes que o servidor não aceita (. # $ [ ] / ou __proto__).' };
    return { ok: true, ficha, nome: embrulhado ? String(dados.nome || '') : '', exportadoEm: embrulhado ? String(dados.exportadoEm || '') : '' };
}

// Chaves que o Firebase recusa (. # $ [ ] /) ou que mexem no protótipo do objeto: ficha com isso não é importada.
const CHAVE_RUIM = /[.#$\[\]/]/;
export function temChaveInvalida(valor, profundidade = 0) {
    if (profundidade > 40 || !valor || typeof valor !== 'object') return profundidade > 40;
    if (Array.isArray(valor)) return valor.some(v => temChaveInvalida(v, profundidade + 1));
    return Object.keys(valor).some(k => CHAVE_RUIM.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype' || temChaveInvalida(valor[k], profundidade + 1));
}

// Ao restaurar um backup da nuvem: onde ele guardou '' no lugar de uma imagem embutida grande (ficou de fora do backup), mantém a imagem
// que a ficha atual tem naquele mesmo lugar, em vez de apagá-la. Devolve uma cópia nova de `nova`.
export function preservarImagensAtuais(nova, atual, limite = LIMITE_IMAGEM_NO_BACKUP) {
    const juntar = (n, a) => {
        if (n === '' && typeof a === 'string' && a.length > limite && a.startsWith('data:')) return a;
        if (Array.isArray(n)) return n.map((v, i) => juntar(v, Array.isArray(a) ? a[i] : undefined));
        if (n && typeof n === 'object') {
            const saida = {};
            Object.keys(n).forEach((k) => { saida[k] = juntar(n[k], a && typeof a === 'object' ? a[k] : undefined); });
            return saida;
        }
        return n;
    };
    return juntar(JSON.parse(JSON.stringify(nova || {})), atual);
}

// Uma ficha de verdade tem vários campos e pelo menos um dos marcadores do app.
export function ehFichaPlausivel(ficha) {
    if (!ficha || typeof ficha !== 'object' || Array.isArray(ficha)) return false;
    if (Object.keys(ficha).length < 5) return false;
    return ['vida', 'bio', 'poderes', 'inventario', 'mana'].some(k => ficha[k] !== undefined);
}

// Poda por tipo: as cópias diárias (AAAA-MM-DD) e as "antes de importar" têm cada uma o seu limite, para várias importações no mesmo dia
// não expulsarem as cópias diárias de dias anteriores. Devolve as chaves a apagar.
export function chavesParaPodar(chaves, { diarios = LIMITE_DIARIOS, antes = LIMITE_ANTES_IMPORTAR } = {}) {
    const todas = [...new Set((chaves || []).filter(Boolean))];
    const ehAntes = (k) => String(k).includes('_antes_');
    return [
        ...chavesParaApagar(todas.filter(k => !ehAntes(k)), diarios),
        ...chavesParaApagar(todas.filter(ehAntes), antes)
    ];
}

// Quais chaves de backup apagar para sobrar no máximo `limite` (as mais antigas primeiro).
export function chavesParaApagar(chaves, limite = LIMITE_BACKUPS) {
    const ordenadas = [...new Set((chaves || []).filter(Boolean))].sort();
    return ordenadas.length > limite ? ordenadas.slice(0, ordenadas.length - limite) : [];
}
