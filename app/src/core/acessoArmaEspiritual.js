// ==========================================
// 🔒 ACESSO À ARMA ESPIRITUAL / FANTASMA NOBRE — lógica pura.
// Nem todo personagem tem uma Arma Espiritual: quem NÃO tem acesso nem enxerga os capítulos dela na
// Ficha Definitiva (só Arsenal Místico e Suprimentos). O Mestre/Co-Mestre concede o acesso por
// personagem (ficha.armaEspiritual.acessoArma). O Mestre sempre vê tudo.
// ==========================================

const CAMPOS_TEXTO = ['nome', 'epiteto', 'cantico', 'danoBase', 'avatarHumano', 'avatarArma'];
const CAMPOS_LISTA = ['passivas', 'runas', 'formas', 'formasVerdadeiras', 'passivasVerdadeira', 'runasVerdadeira', 'passivasFantasma', 'runasFantasma'];

// A Arma Espiritual já foi preenchida? (usado só pra fichas ANTIGAS, sem a flag de acesso: quem já
// tinha uma Arma montada continua com acesso; quem nunca teve, não.)
export function armaEspiritualTemConteudo(arma) {
    if (!arma || typeof arma !== 'object') return false;
    if (CAMPOS_TEXTO.some(c => typeof arma[c] === 'string' && arma[c].trim() !== '')) return true;
    return CAMPOS_LISTA.some(c => Array.isArray(arma[c]) && arma[c].length > 0);
}

// Valor explícito da flag quando existe; senão deriva do conteúdo (fichas antigas).
export function temAcessoArmaEspiritual(ficha) {
    const arma = ficha && ficha.armaEspiritual;
    if (arma && typeof arma.acessoArma === 'boolean') return arma.acessoArma;
    return armaEspiritualTemConteudo(arma);
}

// Quem enxerga os capítulos da Arma Espiritual: o Mestre sempre; o jogador só com acesso.
export function podeVerArmaEspiritual(ficha, isMestre) {
    return !!isMestre || temAcessoArmaEspiritual(ficha);
}

// Capítulos visíveis: sem acesso, só os que não são da Arma Espiritual.
export function filtrarCapitulos(capitulos, idsArma, podeVerArma) {
    return podeVerArma ? capitulos : capitulos.filter(c => !idsArma.includes(c.id));
}

// Aba efetiva: se a escolhida não está disponível (ex.: acesso retirado), cai na primeira visível.
export function resolverAbaVisivel(abaId, capitulosVisiveis) {
    if (capitulosVisiveis.some(c => c.id === abaId)) return abaId;
    return capitulosVisiveis.length > 0 ? capitulosVisiveis[0].id : abaId;
}
