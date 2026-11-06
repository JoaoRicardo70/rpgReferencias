// ==========================================
// 📷 LER IMAGENS COM A SEXTA-FEIRA — lógica pura. Prints de fichas antigas (Google Docs) entram nos importadores de Habilidades e
// de Técnicas: o Gemini lê o texto das imagens e devolve o MESMO JSON que a IA externa devolveria, que segue para a prévia de
// sempre (nada é gravado sem o jogador conferir). Aqui: limites, validação dos arquivos e montagem do pedido ao Gemini.
// A redução da imagem (canvas) e a chamada ficam em services/lerImagemIA.js.
// ==========================================

export const TIPOS_IMAGEM_ACEITOS = ['image/png', 'image/jpeg', 'image/webp'];
export const LIMITE_IMAGENS = 4;
export const LIMITE_BYTES_ORIGINAL = 15 * 1024 * 1024; // arquivo que o jogador escolhe (antes de reduzir)
export const LIMITE_BYTES_ENVIO = 3 * 1024 * 1024; // cada imagem depois de reduzida (base64 decodificado)
export const LADO_MAXIMO_PX = 1800;

// O texto que ocupa o lugar de "TEXTO:" no prompt dos importadores quando a fonte são imagens.
export const TEXTO_DAS_IMAGENS = '(O texto está nas IMAGENS anexadas. Leia TODO o texto delas, na ordem em que aparece, e trate-o como o texto a extrair.)';

export const INSTRUCAO_SISTEMA_IMAGEM = 'Você lê prints de fichas e documentos de RPG e devolve dados estruturados. Transcreva fielmente o que está escrito, sem inventar nada: se algo estiver cortado, ilegível ou ambíguo, não adivinhe, descreva em "naoAplicado". Responda somente com o JSON pedido.';

// { ok: true } ou { ok: false, erro }. `arquivo` = { type, size, name }.
export function validarArquivoImagem(arquivo) {
    if (!arquivo || typeof arquivo !== 'object') return { ok: false, erro: 'Arquivo inválido.' };
    const nome = arquivo.name || 'imagem';
    if (!TIPOS_IMAGEM_ACEITOS.includes(String(arquivo.type || '').toLowerCase())) return { ok: false, erro: `"${nome}" não é PNG, JPG ou WEBP.` };
    if (!(Number(arquivo.size) > 0)) return { ok: false, erro: `"${nome}" está vazio.` };
    if (Number(arquivo.size) > LIMITE_BYTES_ORIGINAL) return { ok: false, erro: `"${nome}" é grande demais (máximo ${Math.round(LIMITE_BYTES_ORIGINAL / 1048576)} MB).` };
    return { ok: true };
}

// Tira o prefixo "data:image/jpeg;base64," de um data URL. Devolve { mimeType, data } ou null.
export function separarDataUrl(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    return m ? { mimeType: m[1], data: m[2] } : null;
}

// Bytes reais de um texto base64 (para checar o limite de envio).
export function bytesDoBase64(data) {
    const s = String(data || '');
    if (!s) return 0;
    const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
    return Math.floor((s.length * 3) / 4) - pad;
}

// Mantém só imagens válidas e dentro do limite de envio; no máximo LIMITE_IMAGENS. Devolve { imagens, descartadas }.
export function filtrarImagensParaEnvio(imagens) {
    const validas = [];
    let descartadas = 0;
    (Array.isArray(imagens) ? imagens : []).forEach((img) => {
        const ok = img && TIPOS_IMAGEM_ACEITOS.includes(img.mimeType) && typeof img.data === 'string' && img.data.length > 0 && bytesDoBase64(img.data) <= LIMITE_BYTES_ENVIO;
        if (ok && validas.length < LIMITE_IMAGENS) validas.push({ mimeType: img.mimeType, data: img.data });
        else descartadas++;
    });
    return { imagens: validas, descartadas };
}

// Instrução extra no começo do prompt dos importadores quando a fonte são imagens.
export function montarPromptComImagens(promptBase) {
    return `As imagens anexadas são prints da ficha/documento de onde vem o texto. Leia todas, na ordem.\n\n${String(promptBase || '')}`;
}

// Corpo `contents` do Gemini: o prompt e as imagens na mesma mensagem do usuário.
export function montarContentsComImagens(prompt, imagens) {
    const { imagens: ok } = filtrarImagensParaEnvio(imagens);
    return [{ role: 'user', parts: [{ text: String(prompt || '') }, ...ok.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))] }];
}
