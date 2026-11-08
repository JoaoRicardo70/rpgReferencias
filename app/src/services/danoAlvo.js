// ==========================================
// 💥 GRAVAR DANO EM OUTRO PERSONAGEM (jogador ou NPC com ficha própria) direto no Firebase:
// Vida, Fadiga dinâmica do golpe e o último elemento recebido (que alimenta a Resistência/Domínio
// elemental do alvo). Usado pelo Dano Rápido do Mestre e pelo Ataque contra um alvo-personagem.
// ==========================================
import useStore from '../stores/useStore';
import { aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto, salvarDummie, salvarCamposPersonagem } from './firebase-sync';
import { absorverDano, descreverAbsorcao } from '../core/escudos';
import { coletarGatilhos } from '../core/gatilhos';
import { temImunidadeTotal, camposParaGravar } from '../core/gatilhosAplicar';
import { aplicarDanoNaVidaDaFicha } from './danoVida';
import { FATOR_EXIBICAO_VITAIS, danoExibidoParaBruto } from '../core/vitals';
import { calcularGanhoFadigaDinamico } from '../core/fadiga';

// 🛡️ Escudos e Vida Temporária (core/escudos.js) de OUTRO personagem: tira do escudo dele o que der do Dano FINAL (escala exibida) e grava só
// o campo `escudos` (null apaga). Usa a ficha mais recente do store. Devolve { restante, absorvido, texto }; sem escudos, nada é gravado.
export function absorverEmPersonagem(nome, ficha, danoExibido, nomeNoFeed = '') {
    const fresca = (useStore.getState().personagens || {})[nome] || ficha;
    // 🛡️ Imunidade total (God Mode): nada é absorvido nem consumido; o dano que sobra é 0.
    if (temImunidadeTotal(fresca) && Number(danoExibido) > 0) return { restante: 0, absorvido: 0, texto: `${nomeNoFeed || nome} está com Imunidade total: nenhum dano foi sofrido`, imune: true };
    const r = absorverDano(fresca, danoExibido);
    if (!(r.absorvido > 0)) return { restante: Math.max(0, Number(danoExibido) || 0), absorvido: 0, texto: '' };
    salvarCamposPersonagem(nome, { escudos: r.escudosNovos.length > 0 ? r.escudosNovos : null });
    // escudosNovos: a lista que ficou gravada (o store ainda tem a antiga); gravarDanoEmPersonagem a aplica no clone antes dos gatilhos.
    return { restante: r.restante, absorvido: r.absorvido, texto: descreverAbsorcao(nomeNoFeed || nome, r), escudosNovos: r.escudosNovos };
}

// `ficha` = ficha ATUAL do alvo; `vidaFinalBruta` = Vida já reduzida, na escala bruta gravada.
export function gravarDanoEmPersonagem(nome, ficha, vidaFinalBruta, { elemento = null, nivelOverride = null, nomeNoFeed = '', escudosNovos, eventoId, golpe } = {}) {
    // 🔔 Alvo com Imunidade total ou gatilhos: quem grava o dano executa os gatilhos dele, sobre a ficha mais fresca, e grava só os campos tocados.
    const fresca = (useStore.getState().personagens || {})[nome] || ficha;
    const danoBruto = (Number(fresca && fresca.vida && fresca.vida.atual) || 0) - Math.max(0, vidaFinalBruta);
    if (fresca && fresca.vida && danoBruto > 0 && (temImunidadeTotal(fresca) || coletarGatilhos(fresca).length > 0)) {
        const clone = JSON.parse(JSON.stringify(fresca));
        // A absorção já foi gravada à parte: o clone parte da lista de escudos PÓS-absorção, para o escudo de um gatilho somar a ela (e não desfazê-la).
        if (Array.isArray(escudosNovos)) { if (escudosNovos.length > 0) clone.escudos = JSON.parse(JSON.stringify(escudosNovos)); else delete clone.escudos; }
        // O escudo já foi consumido antes (absorverEmPersonagem): aqui só o dano que sobrou, em escala exibida.
        const r = aplicarDanoNaVidaDaFicha(clone, danoBruto / FATOR_EXIBICAO_VITAIS, { nome: nomeNoFeed || nome, jaAbsorvido: true, ...(eventoId ? { eventoId } : {}), ...(golpe ? { golpe } : {}) });
        const campos = camposParaGravar(clone, r.caminhos.filter(c => c !== 'vida/atual'));
        if (Object.keys(campos).length > 0) salvarCamposPersonagem(nome, campos);
        gravarEfeitosDoDano(nome, clone, clone.vida.atual, { elemento, nivelOverride });
        return { textos: r.textos, vidaFinalBruta: clone.vida.atual };
    }
    gravarEfeitosDoDano(nome, ficha, vidaFinalBruta, { elemento, nivelOverride });
    return { textos: [], vidaFinalBruta: Math.max(0, vidaFinalBruta) };
}

// Grava a Vida, a Fadiga dinâmica e o elemento recebido (o miolo de sempre; `ficha` = ficha atual do alvo).
function gravarEfeitosDoDano(nome, ficha, vidaFinalBruta, { elemento = null, nivelOverride = null } = {}) {
    const fichaAlvo = ficha || {};
    const novaVida = Math.max(0, vidaFinalBruta);
    // Ficha "simulada" com a Vida já reduzida (e o elemento/nível deste golpe já registrados), só pra
    // calcular o ganho de Fadiga deste golpe com o dado mais atual — nunca é gravada.
    const fichaSimulada = {
        ...fichaAlvo,
        vida: { ...(fichaAlvo.vida || {}), atual: novaVida },
        combate: { ...(fichaAlvo.combate || {}), ultimoElementoRecebido: elemento || null, ultimoElementoRecebidoNivel: nivelOverride }
    };
    const fadigaExtraAtual = Math.max(0, Number(fichaAlvo.combate && fichaAlvo.combate.fadigaExtra) || 0);
    const novaFadigaExtra = fadigaExtraAtual + calcularGanhoFadigaDinamico(fichaSimulada);

    aplicarDanoDireto(nome, novaVida);
    aplicarFadigaDireta(nome, novaFadigaExtra);
    aplicarElementoDireto(nome, elemento || null);
    aplicarElementoNivelDireto(nome, nivelOverride);
}

// Dano Rápido do Mestre em OUTRO jogador: escudo -> gatilhos -> Vida. Devolve { texto (escudo), textos (gatilhos) }.
// Sem gatilhos nem Imunidade total faz EXATAMENTE o de sempre (absorverEmPersonagem + gravarDanoEmPersonagem).
export function aplicarDanoEmPersonagem(nome, ficha, danoExibido, valorRaw, { elemento = null, nivelOverride = null } = {}) {
    const abs = absorverEmPersonagem(nome, ficha, danoExibido, nome);
    const rawFinal = abs.absorvido > 0 ? danoExibidoParaBruto(abs.restante) : (abs.imune ? 0 : valorRaw);
    const g = gravarDanoEmPersonagem(nome, ficha, Math.max(0, ((ficha && ficha.vida && ficha.vida.atual) || 0) - rawFinal), { elemento, nivelOverride, nomeNoFeed: nome, escudosNovos: abs.escudosNovos });
    return { texto: abs.texto, textos: g.textos };
}

// Grava a Vida do alvo de um Ataque: Dummie (salvarDummie) ou personagem (gravarDanoEmPersonagem). Devolve { textos } dos gatilhos do alvo.
export function gravarVidaDoAlvo(idAlvo, alvo, novoHpBruto, { elemento = null, golpe } = {}) {
    if (!alvo) return { textos: [] };
    if (alvo.isPersonagem) {
        return gravarDanoEmPersonagem(alvo.personagemNome, alvo.ficha, novoHpBruto, { elemento, nomeNoFeed: alvo.nome, escudosNovos: alvo.escudosNovos, golpe });
    }
    salvarDummie(idAlvo, { ...alvo, hpAtual: novoHpBruto });
    return { textos: [], vidaFinalBruta: Math.max(0, novoHpBruto) };
}
