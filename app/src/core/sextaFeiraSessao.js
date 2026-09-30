// ==========================================
// SEXTA-FEIRA — RESUMO DE SESSÃO e MEMÓRIA (lógica pura).
//
// O feed de combate (mesas/{mesaId}/feed_combate) não guarda horário em cada evento, mas toda
// chave criada por push() do Firebase começa com o instante da criação (8 caracteres em base 64).
// Isso permite buscar "o que aconteceu desde X" sem mudar o formato do feed: chaveFirebaseDoInstante
// gera a chave mínima daquele instante (pra consulta com startAt) e instanteDaChaveFirebase lê o
// horário de volta.
// ==========================================
import { resumirEventoFeed } from './sextaFeiraFerramentas.js';

const ALFABETO_PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

export const LIMITE_TEXTO_SESSAO = 30000;
export const LIMITE_MEMORIA_IA = 3000;

// Menor chave de push() possível no instante `ms` (os 12 caracteres aleatórios no mínimo).
export function chaveFirebaseDoInstante(ms) {
    let t = Math.max(0, Math.floor(Number(ms) || 0));
    let prefixo = '';
    for (let i = 0; i < 8; i++) {
        prefixo = ALFABETO_PUSH.charAt(t % 64) + prefixo;
        t = Math.floor(t / 64);
    }
    return prefixo + '-'.repeat(12);
}

// Instante (ms) em que uma chave de push() foi criada, ou null se não parecer uma.
export function instanteDaChaveFirebase(chave) {
    if (typeof chave !== 'string' || chave.length < 8) return null;
    let t = 0;
    for (let i = 0; i < 8; i++) {
        const v = ALFABETO_PUSH.indexOf(chave.charAt(i));
        if (v < 0) return null;
        t = t * 64 + v;
    }
    return t;
}

function horaCurta(ms) {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Junta feed e transcrições numa linha do tempo em texto.
// `eventosFeed`: [{ chave, evento }] (chave de push); `transcricoes`: [{ timestamp, autor, texto, tipo }].
// Se passar do limite, mantém o FINAL da sessão (o mais recente) e avisa que o começo foi cortado.
export function montarLinhasSessao({ eventosFeed = [], transcricoes = [] }, limite = LIMITE_TEXTO_SESSAO) {
    const itens = [];
    eventosFeed.forEach(({ chave, evento }) => {
        const quando = instanteDaChaveFirebase(chave);
        const texto = resumirEventoFeed(evento);
        if (quando !== null && texto) itens.push({ quando, linha: `[${horaCurta(quando)}] (combate) ${texto}` });
    });
    transcricoes.forEach((t) => {
        const quando = Number(t?.timestamp);
        if (!Number.isFinite(quando) || !t?.texto) return;
        const quem = t.autor || '?';
        const papel = t.tipo === 'npc' ? ' (NPC)' : (t.tipo === 'narrador' ? ' (narração)' : '');
        itens.push({ quando, linha: `[${horaCurta(quando)}] (fala) ${quem}${papel}: "${String(t.texto).trim()}"` });
    });
    itens.sort((a, b) => a.quando - b.quando);
    const linhas = itens.map(i => i.linha);
    let texto = linhas.join('\n');
    let cortado = false;
    while (texto.length > limite && linhas.length > 1) {
        linhas.shift();
        texto = linhas.join('\n');
        cortado = true;
    }
    return { texto: cortado ? `[... começo da sessão cortado por tamanho ...]\n${texto}` : texto, total: itens.length, cortado };
}

// Destinos possíveis nos Registros (mesmos valores do seletor "Destino" do chat).
export function listarDestinosRegistros(capitulos) {
    const destinos = [{ valor: 'novo_capitulo', rotulo: 'Criar um Capítulo novo' }];
    (Array.isArray(capitulos) ? capitulos : []).forEach((c) => {
        destinos.push({ valor: `novo_arco_${c.id}`, rotulo: `Novo Arco dentro de "${c.titulo}"` });
        (c.arcos || []).forEach(a => destinos.push({ valor: `${c.id}_${a.id}`, rotulo: `Continuar o Arco "${a.titulo}" (Capítulo "${c.titulo}")` }));
    });
    return destinos;
}

export function montarPedidoResumo({ linhasSessao, destinos, desdeTexto }) {
    const opcoes = destinos.map(d => `- ${d.valor}: ${d.rotulo}`).join('\n');
    return [
        `Resuma a sessão de RPG abaixo (${desdeTexto}) para os Registros Akáshicos da mesa.`,
        'Escreva em português, em tom de crônica, com:',
        '1. Um resumo narrativo do que aconteceu, em ordem.',
        '2. Momentos marcantes de combate (quem enfrentou quem, golpes decisivos, derrotas).',
        '3. NPCs e falas importantes, decisões do grupo, itens ou pistas obtidos.',
        'Use só o que está no registro; não invente acontecimentos. Não use sarcasmo neste texto.',
        '',
        'Na ÚLTIMA linha, escreva exatamente "DESTINO: <valor>" escolhendo o melhor lugar para guardar este resumo entre as opções:',
        opcoes,
        '',
        '--- REGISTRO DA SESSÃO ---',
        linhasSessao,
        '--- FIM DO REGISTRO ---',
    ].join('\n');
}

// Separa a linha "DESTINO: x" do texto. Só aceita destinos que existem.
export function extrairDestinoSugerido(texto, destinos) {
    const validos = new Set((destinos || []).map(d => d.valor));
    const linhas = String(texto || '').split('\n');
    let destino = null;
    for (let i = linhas.length - 1; i >= 0; i--) {
        const m = linhas[i].match(/^\s*\**\s*DESTINO\s*:\s*\**\s*`?([\w-]+)`?\s*\**\s*$/i);
        if (m) {
            if (validos.has(m[1])) destino = m[1];
            linhas.splice(i, 1);
            break;
        }
    }
    return { texto: linhas.join('\n').trim(), destino };
}

// Memória da mesa (fatos que o Mestre mandou a Sexta-Feira guardar) no texto da instrução de
// sistema. Fatos "só Mestre" ficam de fora para jogadores. Os mais recentes têm prioridade.
export function montarTextoMemoria(memoria, isMestre, limite = LIMITE_MEMORIA_IA) {
    const fatos = (memoria && typeof memoria === 'object' ? Object.values(memoria) : [])
        .filter(f => f && typeof f.texto === 'string' && f.texto.trim() && (isMestre || !f.soMestre))
        .sort((a, b) => (Number(b.em) || 0) - (Number(a.em) || 0));
    const linhas = [];
    let total = 0;
    for (const f of fatos) {
        const linha = `- ${f.texto.trim()}${f.soMestre ? ' (segredo do Mestre)' : ''}`;
        if (total + linha.length > limite) break;
        linhas.push(linha);
        total += linha.length + 1;
    }
    return linhas.join('\n');
}
