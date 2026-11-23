// ==========================================
// 📚 SUBSTITUIÇÕES DO COMPÊNDIO (imagem/ícone de classe, Grands, condições, elementos, regras)
// O Mestre edita o Compêndio na ficha DELE (ficha.compendioOverrides); o que vale pra mesa é a soma de todas as fichas, com a
// ficha em uso por último (a dela vence). O Mapa e o Ataque já faziam essa soma; a Ficha olhava só a própria ficha, e por isso
// o ícone de classe que o Mestre subiu não aparecia na ficha dos jogadores.
// ==========================================
const SECOES = ['classes', 'grands', 'condicoes', 'elementos', 'regras'];

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

export function mesclarOverridesCompendio(personagens, fichaEmUso) {
    const globais = { classes: {}, grands: {}, condicoes: {}, elementos: {}, regras: {} };
    const somar = (ficha) => {
        const o = ficha && objeto(ficha.compendioOverrides);
        if (!o) return;
        SECOES.forEach((s) => { const parte = objeto(o[s]); if (parte) Object.assign(globais[s], parte); });
    };
    Object.values(objeto(personagens) || {}).forEach(somar);
    somar(fichaEmUso);
    return globais;
}
