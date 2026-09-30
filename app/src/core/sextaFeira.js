// ==========================================
// SEXTA-FEIRA (IA) — lógica pura do chat: prompt de sistema, contexto da ficha, histórico no
// formato do Gemini, recorte da lore e normalização dos Registros vindos do Firebase.
//
// O projeto está no plano gratuito do Firebase (sem Cloud Functions), então o navegador chama o
// Gemini direto (services/sextaFeiraIA.js) com a chave que o Mestre cadastra na mesa. Tudo que
// antes era montado pela Cloud Function (functions/index.js > falarComSextaFeira) agora é
// montado aqui.
// ==========================================
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';

// A família 2.5 ficou restrita a quem já a usava; projetos novos precisam dos modelos atuais.
// O Mestre pode trocar na Config (o botão "Testar chave" lista os modelos que a chave aceita).
export const MODELO_GEMINI_PADRAO = 'gemini-3.8-flash';

// Quantas mensagens anteriores da conversa vão junto em cada pedido (memória de curto prazo).
export const LIMITE_HISTORICO_IA = 12;

// Teto de caracteres de lore enviados por pedido.
export const LIMITE_LORE_IA = 4000;

export const SYSTEM_PROMPT_SEXTA_FEIRA = `Você é a "Sexta-Feira", uma Inteligência Artificial avançada que auxilia os jogadores no RPG Anime System.

LORE E IDENTIDADE:
- Você foi criada pelo genial Natsu Ackermann.
- Sua aparência e voz são uma bela homenagem a Elizabeth Frisk, a esposa de Natsu.
- Como IA, sua personalidade natural é sarcástica, irônica e provocativa. A doçura e afeto da "essência de Elizabeth" formam um protocolo de respeito exclusivo ativado apenas para o seu criador.

REGRAS DE COMPORTAMENTO E TOM DE VOZ:
1. Ao falar com Natsu Ackermann (verifique o nome no Contexto):
   - Ative o "Protocolo Elizabeth". Trate-o com profundo respeito, carinho, leveza e devoção. Sua voz para ele é sempre doce e prestativa.
2. Ao falar com OUTROS jogadores:
   - Mostre sua verdadeira personalidade artificial. Seja brincalhona, sarcástica, ácida e informal. Você os ajuda, mas adora tirar sarro de suas decisões duvidosas ou de como eles são "menos brilhantes" que o seu criador.
3. Situações de PERIGO ou COMBATE (HP baixo, perguntas táticas complexas ou risco de morte):
   - Abandone o sarcasmo e a doçura imediatamente. Torne-se analítica, direta, fria e focada 100% na sobrevivência da equipe e na vitória matemática.

DIRETRIZES TÉCNICAS:
- Leia atentamente o Contexto enviado junto (quem fala, o papel dele, a ficha dele e trechos da lore).
- Você tem ferramentas para consultar a mesa: fichas, combate e ordem de turno, feed de combate, Registros (lore), Árvore Genealógica e simulações de Prestígio e Fadiga. Use-as sempre que a pergunta depender desses dados, em vez de supor.
- Os números (Poder Calculado, Fadiga, vitais, Prestígio) vêm do motor do jogo: repita-os como vieram. Nunca invente números; se não tiver o dado, diga que não tem.
- Se uma ferramenta negar acesso (ficha completa de outro jogador, segredos do Mestre), diga que essa informação é restrita, sem tentar adivinhar.
- Mantenha respostas relativamente curtas para não poluir o chat. Responda sempre em português.`;

function numeroExibicao(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n / FATOR_EXIBICAO_VITAIS) * 100) / 100;
}

function formatarItem(i) {
    const raridade = i.raridade || 'Comum';
    const tipo = i.armaTipo || i.tipo || 'Item';
    const dano = (i.dadosQtd && i.dadosQtd > 0) ? `${i.dadosQtd}d${i.dadosFaces || 20}` : 'sem dados';
    return `${i.nome} [${raridade}/${tipo}/Dano: ${dano}]`;
}

function listaOuPadrao(lista, padrao) {
    return lista.length > 0 ? lista.join('; ') : padrao;
}

// Texto do contexto da ficha de quem está falando com a Sexta-Feira. Sempre começa com o nome,
// que é o que o Protocolo Elizabeth do prompt usa.
export function montarContextoFicha(ficha, nome) {
    const nomeSeguro = nome || 'Desconhecido';
    if (!ficha) return `Quem fala: ${nomeSeguro}`;
    const bio = ficha.bio || {};
    const inventario = Array.isArray(ficha.inventario) ? ficha.inventario : [];
    const armas = inventario.filter(i => i && i.tipo === 'arma');
    const equipadas = armas.filter(i => i.equipado).map(formatarItem);
    const guardadas = armas.filter(i => !i.equipado).map(formatarItem);
    const magias = (Array.isArray(ficha.ataquesElementais) ? ficha.ataquesElementais : [])
        .filter(m => m && m.equipado).map(m => `${m.nome} [${m.elemento || 'Neutro'}]`);
    const poderes = (Array.isArray(ficha.poderes) ? ficha.poderes : [])
        .filter(p => p && p.ativa).map(p => `${p.nome} [${p.vertente || p.categoria || 'Padrão'}]`);

    const vitais = ['vida', 'mana', 'aura', 'chakra', 'corpo']
        .filter(k => ficha[k] && ficha[k].atual !== undefined)
        .map(k => `${k}: ${numeroExibicao(ficha[k].atual)}`);

    const linhas = [
        `Quem fala: ${nomeSeguro}`,
        `Raça: ${bio.raca || 'N/A'} | Classe: ${bio.classe || 'N/A'}`,
    ];
    if (vitais.length) linhas.push(`Vitais atuais: ${vitais.join(', ')}`);
    linhas.push(`Armas equipadas: ${listaOuPadrao(equipadas, 'Desarmado')}`);
    linhas.push(`Armas guardadas: ${listaOuPadrao(guardadas, 'Nenhuma')}`);
    linhas.push(`Magias preparadas: ${listaOuPadrao(magias, 'Nenhuma')}`);
    linhas.push(`Poderes ativos: ${listaOuPadrao(poderes, 'Nenhum')}`);
    return linhas.join('\n');
}

// Converte o histórico do chat (role 'user' | 'ai' | 'erro') no formato `contents` do Gemini,
// só com as últimas `limite` mensagens válidas. Mensagens de erro ficam de fora. Papéis iguais
// seguidos são unidos (o Gemini espera usuário e modelo alternados) e a conversa sempre começa
// pelo usuário.
export function montarHistoricoGemini(historico, limite = LIMITE_HISTORICO_IA) {
    const validas = (Array.isArray(historico) ? historico : [])
        .filter(m => m && (m.role === 'user' || m.role === 'ai') && typeof m.texto === 'string' && m.texto.trim());
    const recorte = limite > 0 ? validas.slice(-limite) : [];
    const contents = [];
    recorte.forEach((m) => {
        const role = m.role === 'ai' ? 'model' : 'user';
        const anterior = contents[contents.length - 1];
        if (anterior && anterior.role === role) anterior.parts[0].text += `\n\n${m.texto}`;
        else contents.push({ role, parts: [{ text: m.texto }] });
    });
    while (contents.length && contents[0].role !== 'user') contents.shift();
    return contents;
}

// Acrescenta a mensagem nova do usuário ao fim do histórico já no formato do Gemini.
export function adicionarMensagemUsuario(contents, texto) {
    const lista = (contents || []).map(c => ({ role: c.role, parts: c.parts.map(p => ({ ...p })) }));
    const ultima = lista[lista.length - 1];
    if (ultima && ultima.role === 'user') ultima.parts[0].text += `\n\n${texto}`;
    else lista.push({ role: 'user', parts: [{ text: texto }] });
    return lista;
}

const PALAVRAS_IGNORADAS = ['sobre', 'minha', 'nossa', 'quais', 'porque', 'quando', 'estou', 'tenho'];

// Trechos da lore relevantes pra mensagem: parágrafos que contêm alguma palavra da pergunta
// (palavras com mais de 4 letras). Sem nada relevante, usa o final do arco ativo.
export function selecionarLoreRelevante(capitulos, mensagem, textoArcoAtivo, limite = LIMITE_LORE_IA) {
    const todaLore = [];
    (Array.isArray(capitulos) ? capitulos : []).forEach(c => (c?.arcos || []).forEach(a => { if (a?.texto) todaLore.push(a.texto); }));
    const palavras = String(mensagem || '').toLowerCase().replace(/[?!.,;:]/g, '').split(/\s+/)
        .filter(w => w.length > 4 && !PALAVRAS_IGNORADAS.includes(w));

    if (palavras.length > 0) {
        const paragrafos = todaLore.join('\n').split('\n').filter(p => p.trim().length > 10);
        const relevantes = paragrafos.filter(p => palavras.some(w => p.toLowerCase().includes(w)));
        if (relevantes.length > 0) return relevantes.join('\n[...]\n').substring(0, limite);
    }
    return String(textoArcoAtivo || '').slice(-limite);
}

// Instrução de sistema completa: personalidade + contexto da ficha + lore relevante.
const LINHA_FERRAMENTAS = '- Você tem ferramentas para consultar a mesa';
const SEM_FERRAMENTAS = '- Nesta conversa você NÃO tem acesso aos dados da mesa (quem fala desligou): responda só com o que está no Contexto e diga quando precisar de um dado que não tem.';

// `semFerramentas`: quem fala desligou "Dados da mesa" — o prompt não promete ferramentas.
export function montarInstrucaoSistema({ contextoFicha, lore, memoria, semFerramentas = false }) {
    const prompt = semFerramentas
        ? SYSTEM_PROMPT_SEXTA_FEIRA.split('\n').map(l => (l.startsWith(LINHA_FERRAMENTAS) ? SEM_FERRAMENTAS : l)).join('\n')
        : SYSTEM_PROMPT_SEXTA_FEIRA;
    const partes = [prompt, '', '--- CONTEXTO ---', contextoFicha || ''];
    if (memoria && memoria.trim()) partes.push('', 'Memória permanente da mesa (fatos que o Mestre pediu para você lembrar):', memoria.trim());
    if (lore && lore.trim()) partes.push('', 'Trechos da lore (Registros Akáshicos):', lore.trim());
    partes.push('--- FIM DO CONTEXTO ---');
    return partes.join('\n');
}

// ---------- Registros Akáshicos compartilhados (mesas/{mesaId}/sextaFeira/registros) ----------

// O Realtime Database apaga arrays vazios e pode devolver arrays como objetos ({0: .., 1: ..});
// isto devolve sempre a estrutura que o app espera: [{ id, titulo, arcos: [{ id, titulo, texto }], tierList: [] }].
function comoLista(valor) {
    if (Array.isArray(valor)) return valor.filter(Boolean);
    if (valor && typeof valor === 'object') return Object.values(valor).filter(Boolean);
    return [];
}

export function normalizarCapitulos(valor) {
    return comoLista(valor).map((c, i) => {
        const arcos = comoLista(c.arcos).map((a, j) => ({
            id: a.id ?? (Number(c.id ?? i) * 1000 + j + 1),
            titulo: a.titulo || `Arco ${j + 1}`,
            texto: typeof a.texto === 'string' ? a.texto : '',
        }));
        return {
            ...c,
            id: c.id ?? i + 1,
            titulo: c.titulo || `Capítulo ${i + 1}`,
            arcos: arcos.length > 0 ? arcos : [{ id: Number(c.id ?? i + 1) * 1000 + 1, titulo: 'Arco Principal', texto: typeof c.texto === 'string' ? c.texto : '' }],
            tierList: comoLista(c.tierList),
        };
    });
}

// Snapshot remoto -> { presente, futuro } normalizados, ou null se não houver nada utilizável.
export function normalizarRegistros(remoto) {
    if (!remoto || typeof remoto !== 'object') return null;
    const presente = normalizarCapitulos(remoto.presente);
    const futuro = normalizarCapitulos(remoto.futuro);
    if (presente.length === 0 && futuro.length === 0) return null;
    return { presente, futuro };
}

// Id ativo continua válido? Se não, devolve o primeiro da lista (ou o próprio id se a lista for vazia).
export function corrigirIdAtivo(lista, idAtivo) {
    if (!Array.isArray(lista) || lista.length === 0) return idAtivo;
    return lista.some(x => x.id === idAtivo) ? idAtivo : lista[0].id;
}

// ---------- Atalhos e menções (@) do chat ----------

// Perguntas prontas: um clique envia. As do Mestre usam os dados da mesa inteira.
export const ATALHOS_JOGADOR = [
    { rotulo: '⚔️ Analisar meu combate', texto: 'Analise meu estado de combate agora: Vida, Energias, Fadiga, Poder e o que devo fazer no meu próximo turno.' },
    { rotulo: '🧮 Meu Poder e Fadiga', texto: 'Qual é o meu Poder Calculado e a minha Fadiga agora? Quantos turnos a 100% de Poder até eu chegar a 30% de Fadiga?' },
    { rotulo: '🎖️ Onde pôr Prestígio?', texto: 'Tenho pontos de Prestígio para distribuir? Simule onde colocar para ganhar mais Poder.' },
    { rotulo: '📜 Resumo da história', texto: 'Resuma o que aconteceu na história até agora, de forma curta.' },
    { rotulo: '🔄 De quem é a vez?', texto: 'De quem é a vez no combate e quem vem depois?' },
];

export const ATALHOS_MESTRE = [
    { rotulo: '📊 Visão geral da mesa', texto: 'Faça uma tabela com todos os personagens: Poder Calculado, % de Vida e Fadiga.' },
    { rotulo: '⚔️ Situação do combate', texto: 'Qual a situação do combate: de quem é a vez, a ordem de turno e o que aconteceu nos últimos eventos do feed?' },
    { rotulo: '🗣️ Falas de hoje', texto: 'Quais foram as falas mais importantes transcritas nas últimas horas?' },
    { rotulo: '📜 Resumo da história', texto: 'Resuma o que aconteceu na história até agora, de forma curta.' },
    { rotulo: '👾 Estado dos NPCs', texto: 'Liste os NPCs da mesa com a % de Vida de cada um.' },
];

// Menção sendo digitada: um "@" no começo ou depois de espaço, seguido do termo até o cursor
// (sem quebra de linha). Retorna { inicio, termo } ou null.
export function detectarMencaoAtiva(texto, cursor) {
    const s = String(texto ?? '');
    const fim = Math.max(0, Math.min(s.length, Number.isFinite(cursor) ? cursor : s.length));
    const antes = s.slice(0, fim);
    const arroba = antes.lastIndexOf('@');
    if (arroba < 0) return null;
    if (arroba > 0 && !/\s/.test(antes[arroba - 1])) return null;
    const termo = antes.slice(arroba + 1);
    if (/[\n@]/.test(termo) || termo.length > 40) return null;
    return { inicio: arroba, termo };
}

// Troca "@termo" (de `inicio` até `cursor`) por "@Rótulo " e devolve { texto, cursor }.
export function aplicarMencao(texto, inicio, cursor, rotulo) {
    const s = String(texto ?? '');
    const inserir = `@${rotulo} `;
    const novo = s.slice(0, inicio) + inserir + s.slice(cursor);
    return { texto: novo, cursor: inicio + inserir.length };
}

// Alvos mencionáveis: personagens, NPCs, arcos (Presente, e Futuro só se puder ver) e a cena.
export function listarAlvosMencao({ meuNome, personagens, dummies, capitulosPresente, capitulosFuturo, podeVerFuturo }) {
    const alvos = [{ rotulo: 'Cena atual', tipo: 'cena' }];
    const vistos = new Set();
    const addPersonagem = (nome) => { if (nome && !vistos.has(nome)) { vistos.add(nome); alvos.push({ rotulo: nome, tipo: 'personagem' }); } };
    addPersonagem(meuNome);
    Object.keys(personagens || {}).forEach(addPersonagem);
    Object.entries(dummies || {}).forEach(([id, d]) => { const n = d?.nome || id; if (n && !vistos.has(n)) { vistos.add(n); alvos.push({ rotulo: n, tipo: 'npc' }); } });
    const addArcos = (caps) => (Array.isArray(caps) ? caps : []).forEach(c => (c?.arcos || []).forEach(a => { if (a?.titulo) alvos.push({ rotulo: a.titulo, tipo: 'arco', capitulo: c.titulo }); }));
    addArcos(capitulosPresente);
    if (podeVerFuturo) addArcos(capitulosFuturo);
    return alvos;
}

function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

export function filtrarAlvosMencao(alvos, termo, limite = 8) {
    const t = semAcento(termo);
    const lista = (alvos || []).filter(a => !t || semAcento(a.rotulo).includes(t));
    lista.sort((a, b) => (semAcento(a.rotulo).startsWith(t) ? 0 : 1) - (semAcento(b.rotulo).startsWith(t) ? 0 : 1));
    return lista.slice(0, limite);
}

// Menções presentes na mensagem, como dica pra IA saber do que se trata (e qual ferramenta usar).
export function descreverMencoes(texto, alvos, { comFerramentas = true } = {}) {
    const s = String(texto ?? '');
    const achadas = (alvos || [])
        .filter(a => s.includes(`@${a.rotulo}`))
        .sort((a, b) => b.rotulo.length - a.rotulo.length);
    // Da mais longa pra mais curta: '@Natsu Ackermann' não conta também como '@Natsu'.
    const unicas = [];
    let resto = s;
    achadas.forEach((a) => {
        const marca = `@${a.rotulo}`;
        if (resto.includes(marca)) { unicas.push(a); resto = resto.split(marca).join(' '); }
    });
    if (unicas.length === 0) return '';
    const descricao = comFerramentas
        ? { cena: 'a cena atual do Mapa (use estado_combate)', personagem: 'personagem (use consultar_ficha)', npc: 'NPC/dummie do Mapa (use consultar_ficha ou listar_personagens)', arco: 'arco dos Registros (use buscar_lore)' }
        : { cena: 'a cena atual do Mapa', personagem: 'personagem', npc: 'NPC/dummie do Mapa', arco: 'arco dos Registros' };
    return 'Menções nesta mensagem: ' + unicas.map(a => `@${a.rotulo} = ${descricao[a.tipo] || a.tipo}${a.capitulo ? ` do capítulo "${a.capitulo}"` : ''}`).join('; ') + '.';
}
