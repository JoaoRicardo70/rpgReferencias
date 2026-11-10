// ==========================================
// ✨ Lado do navegador do "Ler com a IA": manda cada parte do texto ao Gemini (chave da mesa), uma de cada vez
// (cota gratuita), e junta o que deu certo. Regras puras (divisão, mesclagem, erros) em core/transcricaoIA.js.
// Privacidade: a chave nunca é registrada e o texto do usuário não vai para log nenhum; só segue ao Gemini.
// ==========================================
import { chamarGemini } from './sextaFeiraIA';
import { montarPromptImportacao, lerRespostaDaIA } from '../core/importadorIA';
import { montarTextoDaParte, mesclarRespostas, classificarErroLeitura, erroBloqueiaProximas, MENSAGEM_SEM_CHAVE } from '../core/transcricaoIA';

const INSTRUCAO_SISTEMA_TEXTO = 'Você extrai habilidades de textos de fichas e documentos de RPG e devolve dados estruturados. Copie fielmente o que está escrito, sem inventar nada: o que não souber encaixar vai em "naoAplicado". Responda somente com o JSON pedido.';
const MENSAGEM_PARTE_VAZIA = 'A IA não achou habilidades nesta parte do texto.';
const CONFIG_JSON = { responseMimeType: 'application/json' };

// Lê UMA parte: devolve { ok: true, itens } ou { ok: false, erro: { tipo, mensagem } }.
export async function lerParteComIA({ chave, modelo, texto, aba, indice = 1, total = 1, sinal = null, fetchImpl }) {
    if (!chave) return { ok: false, erro: { tipo: 'sem-chave', mensagem: MENSAGEM_SEM_CHAVE } };
    try {
        const prompt = montarPromptImportacao(montarTextoDaParte(texto, indice, total), aba);
        const resposta = await chamarGemini({
            chave, modelo,
            systemInstruction: INSTRUCAO_SISTEMA_TEXTO,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            configuracaoGeracao: CONFIG_JSON,
            sinal,
            ...(fetchImpl ? { fetchImpl } : {}),
        });
        const lido = lerRespostaDaIA(resposta);
        if (!lido.ok) {
            // Lista vazia ({"poderes": []}) não é erro de JSON: a IA só não achou nada nesta parte.
            if (/vazia/.test(lido.erro) || /"poderes"\s*:\s*\[\s*\]/.test(String(resposta || '')) || /^\s*\[\s*\]\s*$/.test(String(resposta || '').replace(/```\w*/g, ''))) return { ok: false, erro: { tipo: 'outro', mensagem: MENSAGEM_PARTE_VAZIA } };
            return { ok: false, erro: classificarErroLeitura(new Error('JSON inválido: ' + lido.erro)) };
        }
        return { ok: true, itens: lido.itens };
    } catch (err) {
        return { ok: false, erro: classificarErroLeitura(err) };
    }
}

// Lê as partes em sequência. `partes`: [{ indice, total, texto }].
// Devolve { itens (mesclados, sem repetir nomes de `jaExistentes`), falhas: [{ indice, total, texto, erro }], cancelado }.
// Cota/sem chave/cancelamento interrompem a fila: as partes restantes viram falhas (para tentar de novo depois).
export async function transcreverEmPartes({ chave, modelo, partes, aba, sinal = null, aoProgresso = null, jaExistentes = [], fetchImpl }) {
    const listas = [];
    const falhas = [];
    let cancelado = false;
    let bloqueio = null;
    for (const parte of partes) {
        if (bloqueio) { falhas.push({ ...parte, erro: bloqueio }); continue; }
        if (sinal && sinal.aborted) { cancelado = true; falhas.push({ ...parte, erro: { tipo: 'cancelado', mensagem: 'Leitura cancelada.' } }); continue; }
        if (typeof aoProgresso === 'function') aoProgresso(parte.indice, parte.total);
        const r = await lerParteComIA({ chave, modelo, texto: parte.texto, aba, indice: parte.indice, total: parte.total, sinal, fetchImpl });
        if (r.ok) { listas.push(r.itens); continue; }
        if (r.erro.tipo === 'cancelado') cancelado = true;
        falhas.push({ ...parte, erro: r.erro });
        if (erroBloqueiaProximas(r.erro.tipo)) bloqueio = r.erro;
    }
    return { itens: mesclarRespostas(listas, jaExistentes), falhas, cancelado };
}
