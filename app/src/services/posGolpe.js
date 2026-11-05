// ==========================================
// 🩸↩️ DEPOIS DO GOLPE — aplica no alvo (jogador, NPC com ficha ou Dummie) os estados negativos que o golpe causa e decide o
// Reflexo automático de quem estava defendendo. Regras puras em core/estadosGolpe.js, core/condicoes.js e core/reflexo.js; aqui
// ficam só as escritas no Firebase (nunca a ficha inteira: só o campo que mudou).
// ==========================================
import { salvarCamposPersonagem } from './firebase-sync';
import { somarEstado } from '../core/condicoes';
import { resolverEstadosNoAlvo, descreverResolucao, juntarAplicados } from '../core/estadosGolpe';
import { reflexosDisponiveis, calcularReflexo, descreverReflexo, custoDoReflexo } from '../core/reflexo';

// Soma os estados já resolvidos na lista de condições do alvo e grava. `fonte` = quem causou (para Amedrontado/Charmado/Provocado).
// Lista de condições do alvo depois de somar os estados (não grava nada).
export function condicoesComEstados(alvo, aplicados, fonte = '') {
    let lista = alvo.isPersonagem ? (alvo.ficha && alvo.ficha.condicoes) : alvo.condicoes;
    juntarAplicados(aplicados).forEach((a) => { lista = somarEstado(lista, a.id, a.stacks, fonte); });
    return lista;
}

// Personagem: grava só o campo `condicoes` (escrita por caminho, não apaga o resto). Dummie: devolve o alvo com as condições novas,
// para quem grava o Dano usar no MESMO salvarDummie (um `set` do nó inteiro; gravar antes seria sobrescrito pelo Dano). Sem nada a aplicar, devolve o alvo como veio.
export function gravarEstadosNoAlvo(idAlvo, alvo, aplicados, fonte = '') {
    if (!alvo || !Array.isArray(aplicados) || aplicados.length === 0) return alvo;
    const lista = condicoesComEstados(alvo, aplicados, fonte);
    if (alvo.isPersonagem) { salvarCamposPersonagem(alvo.personagemNome, { condicoes: lista }); return alvo; }
    return { ...alvo, condicoes: lista };
}

// Resolve (com teste de resistência do alvo, se houver) e grava. Devolve { texto, alvo } (alvo = o alvo a gravar com o Dano; muda só para Dummie).
export function aplicarEstadosDoGolpe({ idAlvo, alvo, estados, critico = false, fonte = '' }) {
    if (!alvo || !Array.isArray(estados) || estados.length === 0) return { texto: '', alvo };
    const r = resolverEstadosNoAlvo(estados, alvo.isPersonagem ? alvo.ficha : null, { critico });
    const alvoFinal = gravarEstadosNoAlvo(idAlvo, alvo, r.aplicados, fonte);
    return { texto: descreverResolucao(r, alvo.nome), alvo: alvoFinal };
}

// Reflexo AUTOMÁTICO do alvo-personagem: o primeiro com `automatico` que ele consiga pagar. Cobra o custo dele e devolve
// { danoNoAlvo, danoNoAtacante, texto }. Sem reflexo, devolve o Dano como veio. Quem chama grava o Dano no atacante.
export function resolverReflexoAutomatico({ alvo, danoNoAlvo, danoOriginal, nomeAtacante, custoGolpeTotal = 0 }) {
    const neutro = { danoNoAlvo, danoNoAtacante: 0, texto: '' };
    if (!alvo || !alvo.isPersonagem || !alvo.ficha) return neutro;
    const ficha = alvo.ficha;
    const candidatos = reflexosDisponiveis(ficha).filter(r => r.reflexo.automatico);
    for (const item of candidatos) {
        const { energia: k, valor: custo, comoPoder } = custoDoReflexo(ficha, item, custoGolpeTotal);
        const temCusto = !comoPoder && (item.reflexo.custoModo === 'igual' || item.reflexo.custoPercentual > 0);
        const campos = {};
        if (temCusto) {
            const atual = Number(ficha[k] && ficha[k].atual);
            if (!Number.isFinite(custo) || !Number.isFinite(atual) || atual < custo) continue; // sem energia para pagar: tenta o próximo
            if (custo > 0) campos[`${k}/atual`] = atual - custo;
        }
        const calculo = calcularReflexo(item.reflexo, { danoChega: danoNoAlvo, danoOriginal });
        if (Object.keys(campos).length > 0) salvarCamposPersonagem(alvo.personagemNome, campos);
        return { danoNoAlvo: calculo.danoNoDefensor, danoNoAtacante: calculo.danoNoAtacante, texto: descreverReflexo(item, calculo, nomeAtacante || 'o atacante') };
    }
    return neutro;
}

// Um por golpe: reúne o que acontece em CADA alvo atingido (Reflexo automático, depois os estados) e soma o Dano que volta
// para o atacante. `aplicar(idAlvo, alvo, dano)` devolve o Dano que o alvo realmente sofre (0 se o Reflexo devolveu tudo).
// `aoAcertar` (core/aoAcertar.js): o que o ATACANTE ganha ao acertar; vale uma vez por golpe, só se algum alvo sofreu Dano (resultado()).
export function criarPosGolpe({ estados = [], critico = false, danoOriginal = 0, nomeAtacante = '', custoGolpeTotal = 0, aoAcertar = [] } = {}) {
    const textos = [];
    const comEstados = new Map(); // Dummies: alvo com as condições novas, para o chamador gravar junto com o Dano
    let danoAtacante = 0;
    let atingiuComDano = false;
    return {
        aplicar(idAlvo, alvo, danoNoAlvo) {
            if (!alvo) return danoNoAlvo;
            let dano = danoNoAlvo;
            let devolveu = false;
            if (alvo.isPersonagem) {
                const r = resolverReflexoAutomatico({ alvo, danoNoAlvo: dano, danoOriginal, nomeAtacante, custoGolpeTotal });
                if (r.texto) { dano = r.danoNoAlvo; danoAtacante += r.danoNoAtacante; textos.push(r.texto); devolveu = true; }
            }
            if (estados.length > 0 && (devolveu ? dano > 0 : true)) {
                const r = aplicarEstadosDoGolpe({ idAlvo, alvo, estados, critico, fonte: nomeAtacante });
                if (r.texto) textos.push(r.texto);
                if (r.alvo !== alvo) comEstados.set(idAlvo, r.alvo);
            }
            if (dano > 0) atingiuComDano = true;
            return dano;
        },
        // Use no lugar do alvo ao gravar o Dano (gravarVidaDoAlvo): leva junto as condições novas do Dummie.
        alvoParaGravar(idAlvo, alvo) { return comEstados.get(idAlvo) || alvo; },
        resultado() { return { textos: [...textos], danoAtacante, aoAcertar: atingiuComDano ? aoAcertar : [], critico }; }
    };
}
