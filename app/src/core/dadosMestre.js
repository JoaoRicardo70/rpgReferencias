// ==========================================
// 🎲 DADOS DO MESTRE — os testes e defesas do Mestre são privados por padrão: só Mestre/Co-Mestre veem no Feed e ele revela aos
// jogadores quando quiser. "Rolagem" = qualquer entrada do feed que não seja aviso do sistema (narração, movimentos...).
// A entrada privada é gravada com `privado: true` e some do feed dos jogadores (nem a animação do dado chega neles).
// ==========================================

const CHAVE = 'rpg_dados_mestre_privados';
const EVENTO = 'rpg-dados-mestre';

// Rolagens que ficam privadas POR PADRÃO: testes, saving throws e defesas do Mestre. Ataques (acerto/dano) seguem públicos porque
// o jogador alvo precisa deles pra receber o aviso de defesa/reação.
export const TIPOS_PRIVADOS_PADRAO = ['skill', 'saving', 'evasiva', 'resistencia'];

export function ehRolagem(entrada) {
    return !!entrada && typeof entrada === 'object' && !!entrada.tipo && entrada.tipo !== 'sistema';
}

// O Mestre escolhe se os dados dele são privados por padrão (liga na primeira vez).
export function lerDadosMestrePrivados() {
    try { return localStorage.getItem(CHAVE) !== '0'; } catch (e) { return true; }
}

export function gravarDadosMestrePrivados(privados) {
    try { localStorage.setItem(CHAVE, privados ? '1' : '0'); } catch (e) { /* sem localStorage: vale só nesta sessão */ }
    try { window.dispatchEvent(new Event(EVENTO)); } catch (e) { /* fora do navegador */ }
}

export function assinarDadosMestre(callback) {
    window.addEventListener(EVENTO, callback);
    return () => window.removeEventListener(EVENTO, callback);
}

// Esta entrada deve ser gravada como privada? `privado` explícito na entrada vence; senão vale o padrão do Mestre.
export function deveSerPrivada(entrada, { ehMestre = false, privadosPorPadrao = true } = {}) {
    if (!entrada || typeof entrada !== 'object') return false;
    if (typeof entrada.privado === 'boolean') return entrada.privado;
    return !!ehMestre && !!privadosPorPadrao && TIPOS_PRIVADOS_PADRAO.includes(entrada.tipo);
}

// Quem pode ver a entrada: a pública, todos; a privada, só o Mestre (que não esteja em Modo Jogador).
export function entradaVisivel(entrada, ehMestre) {
    if (!entrada || typeof entrada !== 'object') return false;
    return !entrada.privado || !!ehMestre;
}
