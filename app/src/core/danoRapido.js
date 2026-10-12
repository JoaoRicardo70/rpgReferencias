// ==========================================
// ⚔️ DANO RÁPIDO DO MESTRE — o cálculo completo (puro), usado TANTO pra aplicar o dano
// (MapaFormContext > aplicarDanoRapido) QUANTO pra "prévia" que o Mestre vê antes de clicar.
// Etapas: valor digitado → (🎲 proporcional à Vida do alvo, se for rolagem de dado) → Disputa de
// Poder (atacante x alvo) → Reduções/Resistências em sequência (+ Domínio elemental) → dano final.
// ==========================================
import { calcularDisputaPoder, getPoderDeEntidade, aplicarDisputaAoDano, descreverDisputa } from './disputaPoder.js';
import { escalarDanoPelaVida, getVidaMaxExibidaDummie, getVidaMaxExibidaFicha } from './danoProporcional.js';
import { getNivelDominio, calcularReducaoDanoElemental } from './dominios.js';
import { getPassosReducaoDano, aplicarReducoesSequenciais, descreverReducoes } from './reducaoDano.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { FATOR_EXIBICAO_VITAIS, danoExibidoParaBruto } from './vitals.js';

// Vida atual/máxima do alvo na escala EXIBIDA (a da barra de HP na tela). Dummie: hpAtual/hpMax;
// jogador/NPC: vida.atual e o teto de Vida da ficha.
export function getVidaDoAlvoExibida(alvo, fichaDoAlvo) {
    if (!alvo) return { atual: null, max: null };
    if (alvo.isDummie) {
        const d = alvo.ficha || {};
        return { atual: (Number(d.hpAtual) || 0) / FATOR_EXIBICAO_VITAIS, max: (Number(d.hpMax) || 0) / FATOR_EXIBICAO_VITAIS };
    }
    const max = getVidaMaxBrutaNpc(fichaDoAlvo) / FATOR_EXIBICAO_VITAIS;
    const bruto = Number(fichaDoAlvo && fichaDoAlvo.vida && fichaDoAlvo.vida.atual);
    const atual = Number.isFinite(bruto) ? bruto / FATOR_EXIBICAO_VITAIS : max;
    return { atual, max };
}

// Entrada: { alvo, fichaDoAlvo, dano, elemento, nivelDominioOverride, nivelDominioAtacante, atacante,
//            danoDeDado, divisorMesa, pontosVida }
// `alvo` = { nome, isDummie, ficha } (como na lista do Dano Rápido); `fichaDoAlvo` = a ficha mais
// atual do alvo (a minha, se o alvo sou eu); `atacante` opcional, mesmo formato de `alvo`.
export function calcularDanoRapido({ alvo, fichaDoAlvo, dano, elemento = null, nivelDominioOverride = null, nivelDominioAtacante = 0, atacante = null, danoDeDado = false, divisorMesa, pontosVida }) {
    const valorDigitado = Math.max(0, Math.floor(Number(dano)) || 0);
    if (!alvo) return null;

    const alvoParaPoder = { ...alvo, ficha: fichaDoAlvo || alvo.ficha };
    const disputa = atacante
        ? calcularDisputaPoder(getPoderDeEntidade(atacante, divisorMesa), getPoderDeEntidade(alvoParaPoder, divisorMesa))
        : null;

    const vidaMaxAlvoExibida = alvo.isDummie ? getVidaMaxExibidaDummie(alvo.ficha) : getVidaMaxExibidaFicha(fichaDoAlvo);
    const baseDano = danoDeDado ? escalarDanoPelaVida(valorDigitado, vidaMaxAlvoExibida, pontosVida) : valorDigitado;
    const valorBruto = aplicarDisputaAoDano(baseDano, disputa);

    const nivelOverride = (nivelDominioOverride === '' || nivelDominioOverride === undefined || nivelDominioOverride === null) ? null : nivelDominioOverride;
    const nivelAtacante = parseFloat(nivelDominioAtacante) || 0;

    // 🛡️ Reduções/Resistências da ficha do alvo + Domínio elemental, em SEQUÊNCIA (core/reducaoDano.js).
    const fichaReducao = alvo.isDummie ? alvo.ficha : fichaDoAlvo;
    const passos = getPassosReducaoDano(fichaReducao, elemento);
    if (elemento && !alvo.isDummie) {
        const nivelDefensor = nivelOverride !== null ? nivelOverride : getNivelDominio(fichaReducao, elemento);
        const reducaoDominio = calcularReducaoDanoElemental(nivelDefensor, nivelAtacante);
        if (reducaoDominio > 0) passos.push({ nome: `Domínio (${elemento})`, percentual: reducaoDominio * 100, origem: 'dominio' });
    }
    const reduzido = aplicarReducoesSequenciais(valorBruto, passos);
    const valor = reduzido.final;

    const anulado = !!(disputa && disputa.ativa && valorBruto <= 0);
    const vida = getVidaDoAlvoExibida(alvo, fichaDoAlvo);
    const vidaDepois = vida.atual === null ? null : Math.max(0, vida.atual - valor);

    return {
        valorDigitado, baseDano, valorBruto, disputa, nivelOverride, nivelAtacante,
        reduzido, valor, valorRaw: danoExibidoParaBruto(valor), anulado,
        textoReducao: reduzido.detalhe.length > 0 ? ` (${descreverReducoes(reduzido)})` : '',
        textoDisputa: disputa && disputa.ativa ? descreverDisputa(disputa) : '',
        vidaAntes: vida.atual, vidaDepois, vidaMax: vida.max,
    };
}
