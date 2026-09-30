// ==========================================
// Chamada ao Gemini direto do navegador (a Sexta-Feira não tem mais Cloud Function: o projeto
// está no plano gratuito do Firebase). A chave é a que o Mestre cadastra na mesa
// (mesas/{mesaId}/sextaFeira/config/chaveGemini) — uma chave gratuita do Google AI Studio.
// Vai no cabeçalho, nunca na URL.
//
// 🛠️ Com `ferramentas` ({ declaracoes, executar }), roda o ciclo de function calling: o Gemini
// pede uma ou mais ferramentas (core/sextaFeiraFerramentas.js), o navegador executa e devolve o
// resultado, até ele responder em texto (no máximo MAX_RODADAS_FERRAMENTAS pedidos).
// ==========================================
import { MODELO_GEMINI_PADRAO } from '../core/sextaFeira';

const URL_BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEMPO_LIMITE_MS = 60000;
export const MAX_RODADAS_FERRAMENTAS = 5;

// Mensagem amigável pra cada falha conhecida da API.
export function traduzirErroGemini(status, mensagemApi = '') {
    const msg = String(mensagemApi || '').toLowerCase();
    if (status === 429) return 'A cota gratuita do Gemini acabou por agora. Tente de novo em alguns minutos.';
    if (status === 400 && msg.includes('api key')) return 'A chave do Gemini cadastrada pelo Mestre é inválida.';
    if (status === 400) return 'O Gemini recusou o pedido (mensagem ou anexo grande demais, ou modelo incompatível).';
    if (status === 403) return 'A chave do Gemini recusou este pedido (chave sem permissão ou restrita a outro site).';
    if (status === 404) return 'O modelo de IA configurado não existe mais. O Mestre precisa trocar o modelo nas configurações da Sexta-Feira.';
    if (status >= 500) return 'O Gemini está instável agora. Tente de novo em instantes.';
    return 'Não consegui falar com o Gemini. Verifique a conexão e tente de novo.';
}

// fetch com tempo limite + JSON + erros traduzidos.
async function requisitar(fetchImpl, url, init) {
    const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controle ? setTimeout(() => controle.abort(), TEMPO_LIMITE_MS) : null;
    let resposta;
    try {
        resposta = await fetchImpl(url, { ...init, signal: controle?.signal });
    } catch (err) {
        if (err?.name === 'AbortError') throw new Error('O Gemini demorou demais para responder. Tente de novo.');
        throw new Error('Não consegui falar com o Gemini. Verifique a conexão e tente de novo.');
    } finally {
        if (timer) clearTimeout(timer);
    }
    let dados = null;
    try { dados = await resposta.json(); } catch (e) { dados = null; }
    if (!resposta.ok) throw new Error(traduzirErroGemini(resposta.status, dados?.error?.message));
    return dados;
}

function textoDaResposta(dados) {
    return (dados?.candidates?.[0]?.content?.parts || [])
        .filter(p => p && !p.thought)
        .map(p => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();
}

function erroSemTexto(dados) {
    const motivo = dados?.candidates?.[0]?.finishReason;
    if (dados?.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(motivo)) {
        return new Error('O Gemini se recusou a responder essa mensagem (filtro de segurança).');
    }
    return new Error('O Gemini respondeu vazio. Tente reformular a mensagem.');
}

export async function chamarGemini({ chave, modelo, systemInstruction, contents, ferramentas = null, fetchImpl = fetch }) {
    if (!chave) throw new Error('A Sexta-Feira ainda não foi configurada: o Mestre precisa cadastrar a chave do Gemini.');
    const nomeModelo = String(modelo || MODELO_GEMINI_PADRAO).trim() || MODELO_GEMINI_PADRAO;
    const url = `${URL_BASE_GEMINI}/${encodeURIComponent(nomeModelo)}:generateContent`;
    const usarFerramentas = !!(ferramentas && Array.isArray(ferramentas.declaracoes) && ferramentas.declaracoes.length && typeof ferramentas.executar === 'function');
    const conversa = [...(contents || [])];

    for (let rodada = 0; rodada <= MAX_RODADAS_FERRAMENTAS; rodada++) {
        const corpo = { systemInstruction: { parts: [{ text: systemInstruction || '' }] }, contents: conversa };
        // Na última rodada não oferece mais ferramentas: força a resposta em texto.
        if (usarFerramentas && rodada < MAX_RODADAS_FERRAMENTAS) corpo.tools = [{ functionDeclarations: ferramentas.declaracoes }];

        const dados = await requisitar(fetchImpl, url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
            body: JSON.stringify(corpo),
        });

        const partes = dados?.candidates?.[0]?.content?.parts || [];
        // Na última rodada (sem ferramentas oferecidas) qualquer functionCall é ignorado e vale o texto.
        const podeUsarFerramentas = usarFerramentas && rodada < MAX_RODADAS_FERRAMENTAS;
        const chamadas = podeUsarFerramentas ? partes.filter(p => p && p.functionCall && p.functionCall.name) : [];
        if (chamadas.length === 0) {
            const texto = textoDaResposta(dados);
            if (!texto) throw erroSemTexto(dados);
            return texto;
        }

        // Devolve o turno do modelo intacto (inclui as thoughtSignature dos modelos novos) e as respostas.
        conversa.push({ role: 'model', parts: partes });
        const respostas = [];
        for (const parte of chamadas) {
            const { name, args, id } = parte.functionCall;
            let resultado;
            try { resultado = await ferramentas.executar(name, args || {}); } catch (err) { resultado = { erro: err?.message || 'Falha na ferramenta.' }; }
            respostas.push({ functionResponse: { ...(id ? { id } : {}), name, response: { resultado: resultado ?? null } } });
        }
        conversa.push({ role: 'user', parts: respostas });
    }
    throw new Error('A Sexta-Feira se perdeu consultando os dados. Tente perguntar de outro jeito.');
}

// Modelos de texto que esta chave pode usar (para o Mestre escolher na Config).
export async function listarModelosGemini({ chave, fetchImpl = fetch }) {
    if (!chave) throw new Error('Cole a chave do Gemini antes de testar.');
    const dados = await requisitar(fetchImpl, `${URL_BASE_GEMINI}?pageSize=200`, {
        method: 'GET',
        headers: { 'x-goog-api-key': chave },
    });
    const ignorar = /(image|tts|live|embedding|transcribe|audio|vision|aqa|imagen|veo)/i;
    return (Array.isArray(dados?.models) ? dados.models : [])
        .filter(m => m && typeof m.name === 'string' && (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => ({ id: m.name.replace(/^models\//, ''), nome: m.displayName || m.name.replace(/^models\//, '') }))
        .filter(m => m.id.startsWith('gemini') && !ignorar.test(m.id))
        .sort((x, y) => y.id.localeCompare(x.id, 'en', { numeric: true }));
}
