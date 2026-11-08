// ==========================================
// 🩸↩️ DEPOIS DO GOLPE — aplica no alvo (jogador, NPC com ficha ou Dummie) os estados negativos que o golpe causa e decide o
// Reflexo automático de quem estava defendendo. Regras puras em core/estadosGolpe.js, core/condicoes.js e core/reflexo.js; aqui
// ficam só as escritas no Firebase (nunca a ficha inteira: só o campo que mudou).
// ==========================================
import useStore from '../stores/useStore';
import { salvarCamposPersonagem } from './firebase-sync';
import { somarEstado } from '../core/condicoes';
import { resolverEstadosNoAlvo, descreverResolucao, juntarAplicados } from '../core/estadosGolpe';
import { reflexosDisponiveis, calcularReflexo, descreverReflexo, custoDoReflexo } from '../core/reflexo';
import { entradasNoAlvo, resolverAoAcertarNoAlvo } from '../core/aoAcertar';
import { absorverEmPersonagem } from './danoAlvo';
import { temImunidadeTotal } from '../core/gatilhosAplicar';

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
export function criarPosGolpe({ estados = [], critico = false, danoOriginal = 0, nomeAtacante = '', custoGolpeTotal = 0, aoAcertar = [], nivel = 'normal' } = {}) {
    const textos = [];
    const comEstados = new Map(); // Dummies: alvo com as condições novas, para o chamador gravar junto com o Dano
    const escudosPosAbsorcao = new Map(); // alvo-personagem: lista de escudos gravada após a absorção
    let danoAtacante = 0;
    let atingiuComDano = false;
    // 🕳️ Efeitos 'Ao acertar' que mexem no ALVO (dreno de energia, debuff): valem em cada alvo-personagem que sofreu Dano.
    const noAlvo = entradasNoAlvo(aoAcertar);
    let avisouSemFicha = false;
    return {
        aplicar(idAlvo, alvo, danoNoAlvo) {
            if (!alvo) return danoNoAlvo;
            // 🛡️ God Mode (Imunidade total do alvo-personagem): ignora TUDO — nada de Reflexo, estados do golpe, 'Ao acertar' no alvo, escudo
            // gasto nem efeitos no atacante que dependem de ter causado Dano (atingiuComDano continua falso). Sem Imunidade nada muda.
            if (alvo.isPersonagem && alvo.personagemNome) {
                const fresca = (useStore.getState().personagens || {})[alvo.personagemNome] || alvo.ficha;
                if (temImunidadeTotal(fresca)) { textos.push(`${alvo.nome} está com Imunidade total: o golpe não surtiu efeito`); return 0; }
            }
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
            if (dano > 0 && noAlvo.length > 0) {
                if (alvo.isPersonagem && alvo.ficha) {
                    // Ficha MAIS RECENTE do alvo no store (a do `alvo` é a do momento do clique): reduz a janela de sobrescrever buffs/energia novos.
                    const fichaFresca = (useStore.getState().personagens || {})[alvo.personagemNome] || alvo.ficha;
                    const r = resolverAoAcertarNoAlvo(noAlvo, fichaFresca, { critico, nomeAtacante });
                    const campos = { ...r.campos, ...(r.buffs ? { buffsTemporarios: r.buffs } : {}) };
                    if (Object.keys(campos).length > 0) salvarCamposPersonagem(alvo.personagemNome, campos);
                    r.textos.forEach(t => textos.push(`${alvo.nome}: ${t}`));
                } else if (!avisouSemFicha) {
                    avisouSemFicha = true;
                    textos.push('ℹ️ Entidade do Mapa não tem ficha: dreno de energia, debuff e cura reduzida (Ao acertar) não se aplicam a ela.');
                }
            }
            if (dano > 0) atingiuComDano = true;
            // 🛡️ Por último: escudos/Vida temporária do alvo-personagem absorvem o Dano final (efeitos 'Ao acertar' valem mesmo que o escudo absorva tudo).
            if (dano > 0 && alvo.isPersonagem && alvo.personagemNome) {
                const a = absorverEmPersonagem(alvo.personagemNome, alvo.ficha, dano, alvo.nome);
                if (a.texto) { dano = a.restante; textos.push(a.texto); }
                if (a.escudosNovos) escudosPosAbsorcao.set(idAlvo, a.escudosNovos);
            }
            return dano;
        },
        // Use no lugar do alvo ao gravar o Dano (gravarVidaDoAlvo): leva junto as condições novas do Dummie.
        // Leva junto os escudos pós-absorção do alvo-personagem (para os gatilhos dele partirem da lista certa).
        alvoParaGravar(idAlvo, alvo) { const base = comEstados.get(idAlvo) || alvo; return escudosPosAbsorcao.has(idAlvo) ? { ...base, escudosNovos: escudosPosAbsorcao.get(idAlvo) } : base; },
        // Nível do golpe (normal|critico|fatal) para o evento `atingido` do alvo-personagem: passe a gravarVidaDoAlvo({ golpe }).
        golpe() { return { nivel }; },
        // 🔔 Frases dos gatilhos do alvo (Negar morte etc.), vindas de gravarVidaDoAlvo, entram no resumo do golpe.
        adicionarTextos(r) { ((r && r.textos) || []).forEach(t => textos.push(`🔔 ${t}`)); },
        resultado() { return { textos: [...textos], danoAtacante, aoAcertar: atingiuComDano ? aoAcertar : [], critico }; },
        // 🔔 Algum alvo sofreu Dano? (dispara o evento `acertou` do atacante) e o nível do golpe.
        causouDano() { return atingiuComDano; },
    };
}
