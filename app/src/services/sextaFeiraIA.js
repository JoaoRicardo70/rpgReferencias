// ==========================================
// Chamada ao Gemini direto do navegador (a Sexta-Feira não tem mais Cloud Function: o projeto
// está no plano gratuito do Firebase). A chave é a que o Mestre cadastra na mesa
// (mesas/{mesaId}/sextaFeira/config/chaveGemini) — uma chave gratuita do Google AI Studio,
// restrita ao domínio do site no Google Cloud. Vai no cabeçalho, nunca na URL.
// ==========================================
import { MODELO_GEMINI_PADRAO } from '../core/sextaFeira';

const URL_BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEMPO_LIMITE_MS = 60000;

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

export async function chamarGemini({ chave, modelo, systemInstruction, contents, fetchImpl = fetch }) {
    if (!chave) throw new Error('A Sexta-Feira ainda não foi configurada: o Mestre precisa cadastrar a chave do Gemini.');
    const nomeModelo = String(modelo || MODELO_GEMINI_PADRAO).trim() || MODELO_GEMINI_PADRAO;
    const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controle ? setTimeout(() => controle.abort(), TEMPO_LIMITE_MS) : null;

    let resposta;
    try {
        resposta = await fetchImpl(`${URL_BASE_GEMINI}/${encodeURIComponent(nomeModelo)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction || '' }] },
                contents,
            }),
            signal: controle?.signal,
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw new Error('O Gemini demorou demais para responder. Tente de novo.');
        throw new Error('Não consegui falar com o Gemini. Verifique a conexão e tente de novo.');
    } finally {
        if (timer) clearTimeout(timer);
    }

    let dados = null;
    try { dados = await resposta.json(); } catch (e) { dados = null; }

    if (!resposta.ok) throw new Error(traduzirErroGemini(resposta.status, dados?.error?.message));

    const texto = (dados?.candidates?.[0]?.content?.parts || [])
        .map(p => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();
    if (!texto) {
        const motivo = dados?.candidates?.[0]?.finishReason;
        if (dados?.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(motivo)) {
            throw new Error('O Gemini se recusou a responder essa mensagem (filtro de segurança).');
        }
        throw new Error('O Gemini respondeu vazio. Tente reformular a mensagem.');
    }
    return texto;
}
