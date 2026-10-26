// ==========================================
// 🖼️ CHAT DE MÍDIA (Sala da Party) — lógica pura: validar a imagem, calcular o tamanho reduzido, ordenar a lista e montar a
// ficha de NPC criada a partir de uma imagem. O envio (Storage + Realtime Database) fica em services/midia-sync.js.
// ==========================================

export const LIMITE_MIDIA = 20;                    // quantas imagens a lista mostra (as mais novas)
export const TAMANHO_MAX_ORIGINAL = 12 * 1024 * 1024; // recusa arquivos gigantes antes de tentar reduzir
export const LIMITE_STORAGE = 5 * 1024 * 1024;    // o Storage recusa arquivos de 5 MB ou mais
export const LADO_MAX_PADRAO = 960;                // a imagem enviada é reduzida pra caber nesse lado maior
// O Firebase Storage não é confiável em produção: a imagem vai como data URL dentro do Realtime Database (mesmo padrão dos avatares).
export const LIMITE_DATA_URL = 300000;             // caracteres do data URL (≈ 220 KB de imagem)
export const LIMITE_NOME_NPC = 50;

export const MENSAGEM_IMAGEM_INVALIDA = 'Escolha uma imagem (PNG, JPG, WEBP ou GIF). Depois de reduzida ela precisa ficar pequena (até uns 220 KB); GIFs grandes não cabem.';

export function ehImagemValida(arquivo) {
    return !!arquivo && typeof arquivo.type === 'string' && /^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(arquivo.type)
        && Number(arquivo.size) > 0 && Number(arquivo.size) <= TAMANHO_MAX_ORIGINAL;
}

// Novo tamanho mantendo a proporção, sem nunca ampliar.
export function tamanhoReduzido(largura, altura, ladoMax = LADO_MAX_PADRAO) {
    const w = Number(largura) || 0;
    const h = Number(altura) || 0;
    if (w <= 0 || h <= 0) return { largura: 0, altura: 0 };
    const maior = Math.max(w, h);
    if (maior <= ladoMax) return { largura: w, altura: h };
    const fator = ladoMax / maior;
    return { largura: Math.max(1, Math.round(w * fator)), altura: Math.max(1, Math.round(h * fator)) };
}

// O Firebase devolve { id: entrada }: vira lista em ordem cronológica (mais antiga primeiro), só as `limite` mais novas.
// A URL da imagem vem do banco (qualquer usuário escreve lá): só vale se for um arquivo do Firebase Storage da PRÓPRIA pasta
// de mídia desta mesa. Isso protege o <img src> (rastreadores externos) e o deleteObject (arquivos alheios, como avatares).
export function ehDataUrlDeImagem(url) {
    return typeof url === 'string' && url.length <= LIMITE_DATA_URL && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url);
}

export function urlDeMidiaSegura(url, mesaId) {
    if (ehDataUrlDeImagem(url)) return true;
    if (typeof url !== 'string' || !mesaId) return false;
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return false;
        const m = /^\/v0\/b\/[^/]+\/o\/(.+)$/.exec(u.pathname);
        return !!m && decodeURIComponent(m[1]).startsWith(`mesas/${mesaId}/midia/`);
    } catch (e) {
        return false;
    }
}

export function listarMidia(brutos, limite = LIMITE_MIDIA, mesaId = null) {
    if (!brutos || typeof brutos !== 'object') return [];
    return Object.entries(brutos)
        .filter(([, e]) => e && typeof e === 'object' && typeof e.url === 'string' && e.url && (!mesaId || urlDeMidiaSegura(e.url, mesaId)))
        .map(([id, e]) => ({ id, ...e }))
        .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
        .slice(-limite);
}

// Quem pode apagar uma imagem: o Mestre (qualquer uma) ou o próprio autor.
export function podeApagarMidia(entrada, { ehMestre = false, meuNome = '' } = {}) {
    if (!entrada) return false;
    return !!ehMestre || (!!meuNome && entrada.autor === meuNome);
}

// A chave no Firebase troca .#$[]/ por _ : dois nomes que viram a mesma chave são o mesmo personagem.
const chaveDoNome = (n) => String(n || '').replace(/[.#$[\]/]/g, '_').trim().toLowerCase();

export function nomeDeNpcValido(nome, existentes = []) {
    const n = String(nome || '').trim();
    if (!n) return { ok: false, motivo: 'Dê um nome ao NPC.' };
    if (n.length > LIMITE_NOME_NPC) return { ok: false, motivo: `O nome pode ter até ${LIMITE_NOME_NPC} letras.` };
    if (/^_*$/.test(chaveDoNome(n))) return { ok: false, motivo: 'Use letras ou números no nome.' };
    const chave = chaveDoNome(n);
    const igual = (existentes || []).some(e => chaveDoNome(e) === chave);
    if (igual) return { ok: false, motivo: 'Já existe um personagem com esse nome.' };
    return { ok: true, nome: n };
}

// Ficha de NPC a partir de uma ficha padrão (`fichaBase`, já clonada) e da imagem: mesma estrutura de qualquer personagem,
// marcada como NPC (só o Mestre enxerga até liberar) e com a imagem como avatar.
export function montarFichaNpcDeImagem(fichaBase, nome, url, agora = Date.now()) {
    const ficha = { ...(fichaBase || {}) };
    ficha.avatar = { ...(ficha.avatar || {}), base: url };
    ficha.bio = { ...(ficha.bio || {}), mesa: 'npc', classe: (ficha.bio && ficha.bio.classe) || 'NPC' };
    ficha.isNPC = true;
    ficha.dataCriacao = agora;
    ficha.nome = nome;
    return ficha;
}

export function descreverErroMidia(erro) {
    const codigo = String((erro && (erro.code || erro.codigo)) || '').toLowerCase();
    if (codigo.includes('permission')) return 'O Firebase recusou a gravação (permission_denied): as regras do banco ainda não liberam o chat de mídia desta mesa.';
    if (erro && erro.motivo) return erro.motivo;
    if (codigo.includes('unauthorized') || codigo.includes('storage/')) return `O armazenamento recusou o envio da imagem (código: ${codigo}). Tente uma imagem menor.`;
    const detalhe = codigo || (erro && erro.message) || '';
    return `Não foi possível enviar a imagem. Verifique a conexão.${detalhe ? ` (${String(detalhe).slice(0, 120)})` : ''}`;
}
