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

export const MODELO_GEMINI_PADRAO = 'gemini-2.5-flash';

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
- Leia atentamente o Contexto enviado junto (ficha de quem fala com você e trechos da lore).
- Use os dados do Contexto para respostas imersivas e precisas. Nunca invente números que não estejam no Contexto; se não souber, diga que não tem esse dado.
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
export function montarInstrucaoSistema({ contextoFicha, lore }) {
    const partes = [SYSTEM_PROMPT_SEXTA_FEIRA, '', '--- CONTEXTO ---', contextoFicha || ''];
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
