// ==========================================
// 👁️ PERCEPÇÃO DE PODER — o que cada jogador consegue saber do Poder Calculado dos outros.
// Pedido do usuário: ao clicar num personagem no Mapa, o jogador NÃO vê o Poder exato, só uma
// estimativa ("Poder entre X e Y"). Quem é da classe Assassino pode OCULTAR muito (ou totalmente)
// o próprio Poder. Habilidades/Poderes/Técnicas/itens com o efeito PERCEPCAO_PODER estreitam a
// faixa — quanto mais forte, mais perto do valor real, até o valor exato.
//
// Tudo é medido numa única conta, em PONTOS (1 ponto = 1% de incerteza):
//   incerteza = 50 (base) + ocultação do alvo (0 a 100) − percepção do observador
//   • incerteza 0 (ou menos)  → valor EXATO;
//   • entre 0 e 150           → FAIXA: o Poder é encaixado numa grade fixa de degraus geométricos
//                               (cada degrau vale g = 1 + 2·i vezes o anterior, i = incerteza/100) e o
//                               jogador vê os dois limites do degrau em que o valor real está;
//   • 150 ou mais             → Poder OCULTO ("???").
// Os limites dependem só do degrau e da incerteza — nunca do valor real dentro dele — então o jogador
// não consegue "inverter" a faixa pra descobrir o número exato. O real sempre fica DENTRO da faixa.
// Ex.: sem percepção nem ocultação (i = 0,5) → degraus de x2. Assassino com ocultação 100 → oculto; com percepção 50
// ainda é ±100%; só com percepção 150 (ou mais) o Assassino é visto por completo.
// O Mestre vê tudo exato e o dono do personagem também.
// ==========================================
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { getEfeitosDeClasse } from './attributes.js';
import { getPoderParaDisputa, getPoderDummie } from './disputaPoder.js';

export const ATRIBUTO_PERCEPCAO_PODER = 'percepcao_poder';
export const ATRIBUTO_OCULTACAO_PODER = 'ocultacao_poder';
export const INCERTEZA_BASE_PODER = 50;
export const LIMITE_PODER_OCULTO = 150;
export const OCULTACAO_MAXIMA = 100;
// Percepção mínima pra o jogador saber, no feed de combate, se o SEU golpe foi efetivo ou não
// (o número exato recalculado pela Disputa de Poder é só do Mestre).
export const PERCEPCAO_VER_EFETIVIDADE = 30;
// Classes que ocultam o Poder de nascença (id do Compêndio). Pretender/Alter Ego valem pela subclasse.
export const CLASSES_OCULTACAO_TOTAL = ['assassin'];

export function getClasseEfetiva(ficha) {
    let classe = String(ficha?.bio?.classe || '').toLowerCase();
    const sub = String(ficha?.bio?.subClasse || '').toLowerCase();
    if ((classe === 'pretender' || classe === 'alterego') && sub) classe = sub;
    return classe;
}

// Soma o `valor` de todos os efeitos de um atributo especial nas MESMAS fontes que o getBuffs lê
// (Grimório ativo/passivo, itens equipados e suas formas, Pactos sincronizados, Passivas e Classe).
// Esses atributos não existem como Status, então não mexem em mais nada do Poder.
export function somarEfeitosDeAtributo(ficha, atributo) {
    if (!ficha) return 0;
    let total = 0;
    const alvo = String(atributo).toLowerCase();
    const somar = (efeitos) => {
        if (!Array.isArray(efeitos)) return;
        efeitos.forEach(e => {
            if (!e || String(e.atributo || '').toLowerCase() !== alvo) return;
            const v = parseFloat(e.valor);
            if (Number.isFinite(v)) total += v;
        });
    };
    const somarForma = (dono) => {
        if (!dono.formaAtivaId || !Array.isArray(dono.formas)) return;
        const forma = dono.formas.find(f => f && f.id === dono.formaAtivaId);
        if (!forma) return;
        const config = (dono.configAtivaId && (forma.configs || []).find(c => c && c.id === dono.configAtivaId)) || (forma.configs || [])[0] || null;
        const fonte = config || forma;
        somar(fonte.efeitos);
        somar(fonte.efeitosPassivos);
    };

    (ficha.poderes || []).forEach(p => {
        if (!p) return;
        const r = resolverEfeitosEntidade(p);
        if (p.ativa) somar(r.efeitos);
        somar(r.efeitosPassivos);
    });
    (ficha.inventario || []).forEach(item => {
        if (!item || !item.equipado) return;
        const forma = item.formaAtivaId && Array.isArray(item.formas) ? item.formas.find(f => f && f.id === item.formaAtivaId) : null;
        if (!(forma && forma.acumulaFormaBase === false)) {
            somar(item.efeitos);
            somar(item.efeitosPassivos);
        }
        somarForma(item);
    });
    (ficha.seresSelados || []).forEach(ser => {
        if (!ser || !ser.ativo) return;
        const r = resolverEfeitosEntidade(ser);
        somar(r.efeitos);
        somar(r.efeitosPassivos);
        somarForma(ser);
    });
    (ficha.passivas || []).forEach(p => { if (p) somar(p.efeitos); });
    try { somar(getEfeitosDeClasse(ficha)); } catch (e) { /* sem classe registrada */ }
    return total;
}

// Pontos de percepção de quem OLHA (nunca negativo).
export function getPercepcaoPoder(ficha) {
    return Math.max(0, somarEfeitosDeAtributo(ficha, ATRIBUTO_PERCEPCAO_PODER));
}

// Até quanto o personagem PODE ocultar o próprio Poder: Assassino = 100; os demais, só o que
// Habilidades/Poderes/itens com OCULTACAO_PODER derem.
export function getTetoOcultacaoPoder(ficha) {
    if (!ficha) return 0;
    const deClasse = CLASSES_OCULTACAO_TOTAL.includes(getClasseEfetiva(ficha)) ? OCULTACAO_MAXIMA : 0;
    const deEfeitos = Math.max(0, somarEfeitosDeAtributo(ficha, ATRIBUTO_OCULTACAO_PODER));
    return Math.min(OCULTACAO_MAXIMA, deClasse + deEfeitos);
}

// Quanto o personagem está ocultando agora (o controle da Ficha, limitado ao teto).
export function getOcultacaoPoder(ficha) {
    const teto = getTetoOcultacaoPoder(ficha);
    if (teto <= 0) return 0;
    const v = parseFloat(ficha?.ocultacaoPoder);
    if (!Number.isFinite(v)) return 0;
    return Math.min(teto, Math.max(0, v));
}

export function calcularIncertezaPoder(ocultacao, percepcao) {
    const o = Math.min(OCULTACAO_MAXIMA, Math.max(0, Number(ocultacao) || 0));
    const p = Math.max(0, Number(percepcao) || 0);
    return Math.max(0, INCERTEZA_BASE_PODER + o - p);
}

// 3 algarismos significativos pra faixa não entregar o valor por casas decimais.
function arredondarSignificativo(v, paraCima) {
    if (!(v > 0)) return 0;
    const expoente = Math.max(0, Math.floor(Math.log10(v)) - 2);
    const passo = Math.pow(10, expoente);
    const r = (paraCima ? Math.ceil(v / passo) : Math.floor(v / passo)) * passo;
    return Number.isFinite(r) ? r : v;
}

// Estimativa do Poder `poder` (número, mesma escala do Scouter). Devolve null se o Poder é desconhecido.
//   { modo: 'exato' | 'faixa' | 'oculto', min, max, incerteza }
export function estimarPoder(poder, { ocultacao = 0, percepcao = 0 } = {}) {
    if (poder === null || poder === undefined || poder === '') return null;
    const real = Number(poder);
    if (!Number.isFinite(real) || real < 0) return null;
    const incerteza = calcularIncertezaPoder(ocultacao, percepcao);
    if (incerteza >= LIMITE_PODER_OCULTO) return { modo: 'oculto', min: null, max: null, incerteza };
    if (incerteza <= 0 || real === 0) return { modo: 'exato', min: real, max: real, incerteza: 0 };
    // Degrau da grade em que o Poder cai: [g^k, g^(k+1)). Abaixo de 1 o degrau é [0, g^0 = 1).
    const g = 1 + 2 * (incerteza / 100);
    let min = 0;
    let max = 1;
    if (real >= 1) {
        let k = Math.floor(Math.log(real) / Math.log(g));
        while (Math.pow(g, k) > real) k--;
        while (Math.pow(g, k + 1) <= real) k++;
        min = Math.pow(g, k);
        max = Math.pow(g, k + 1);
    }
    min = Math.min(real, arredondarSignificativo(min, false));
    max = Math.max(real, arredondarSignificativo(max, true));
    return { modo: 'faixa', min, max, incerteza };
}

// Quanto Poder o observador consegue enxergar: de "Oculto" a "Exata".
export function rotuloPrecisaoPoder(estimativa) {
    if (!estimativa) return '';
    if (estimativa.modo === 'oculto') return 'Oculto';
    if (estimativa.modo === 'exato') return 'Exata';
    if (estimativa.incerteza >= 100) return 'Muito vaga';
    if (estimativa.incerteza >= 50) return 'Vaga';
    if (estimativa.incerteza >= 20) return 'Boa';
    return 'Precisa';
}

// Texto da estimativa; `formatar` é o formatador de Poder da tela (formatarPoderCosmico).
export function descreverEstimativaPoder(estimativa, formatar = (n) => String(n)) {
    if (!estimativa) return '—';
    if (estimativa.modo === 'oculto') return '???';
    if (estimativa.modo === 'exato') return formatar(Math.floor(estimativa.min));
    return `entre ${formatar(Math.floor(estimativa.min))} e ${formatar(Math.ceil(estimativa.max))}`;
}

// Estimativa do Poder de uma entidade do Mapa vista por `observador` (a ficha de quem olha).
//   entidade: { isDummie, ficha, id, nome }. Entidade (dummy) com Vida oculta esconde o Poder também
//   (o campo "HP Oculto" do token vale pros dois, ver MapaMestreGavetaTokens).
export function estimarPoderDeEntidade(entidade, observador, divisorPoderMesa) {
    if (!entidade) return null;
    if (entidade.isDummie) {
        const dummie = entidade.ficha || {};
        const poder = getPoderDummie(dummie);
        if (poder === null) return null;
        if (dummie.visibilidadeHp && dummie.visibilidadeHp !== 'todos') return { modo: 'oculto', min: null, max: null, incerteza: LIMITE_PODER_OCULTO };
        return estimarPoder(poder, { ocultacao: 0, percepcao: getPercepcaoPoder(observador) });
    }
    const poder = getPoderParaDisputa(entidade.ficha, divisorPoderMesa);
    if (poder === null) return null;
    return estimarPoder(poder, { ocultacao: getOcultacaoPoder(entidade.ficha), percepcao: getPercepcaoPoder(observador) });
}

export function enxergaEfetividade(percepcao) {
    return (Number(percepcao) || 0) >= PERCEPCAO_VER_EFETIVIDADE;
}

// Frase da efetividade de um golpe (categoria de classificarEfetividade). `nivel` vira classe CSS.
export function descreverEfetividade(categoria) {
    switch (categoria) {
        case 'alta': return { texto: 'Golpe muito efetivo', nivel: 'alta' };
        case 'normal': return { texto: 'Golpe efetivo', nivel: 'normal' };
        case 'reduzida': return { texto: 'Golpe pouco efetivo', nivel: 'reduzida' };
        case 'nula': return { texto: 'Golpe sem efeito', nivel: 'nula' };
        default: return null;
    }
}

// Condição de saúde que QUALQUER um percebe a olho (sem números): fração de Vida de 0 a 1.
// `nivel` vira a classe CSS moldura-condicao--<nivel> (a cor mora no styles.css).
export function descreverCondicaoVida(fracao) {
    const f = Number(fracao);
    if (fracao === null || fracao === undefined || !Number.isFinite(f)) return { texto: 'Desconhecida', nivel: 'desconhecida' };
    if (f <= 0) return { texto: 'Caído', nivel: 'critica' };
    if (f <= 0.25) return { texto: 'À beira da morte', nivel: 'critica' };
    if (f <= 0.5) return { texto: 'Gravemente ferido', nivel: 'grave' };
    if (f <= 0.75) return { texto: 'Ferido', nivel: 'media' };
    if (f < 1) return { texto: 'Levemente ferido', nivel: 'leve' };
    return { texto: 'Ileso', nivel: 'ileso' };
}
