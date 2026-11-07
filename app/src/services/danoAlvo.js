// ==========================================
// 💥 GRAVAR DANO EM OUTRO PERSONAGEM (jogador ou NPC com ficha própria) direto no Firebase:
// Vida, Fadiga dinâmica do golpe e o último elemento recebido (que alimenta a Resistência/Domínio
// elemental do alvo). Usado pelo Dano Rápido do Mestre e pelo Ataque contra um alvo-personagem.
// ==========================================
import useStore from '../stores/useStore';
import { aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto, salvarDummie, salvarCamposPersonagem } from './firebase-sync';
import { absorverDano, descreverAbsorcao } from '../core/escudos';
import { calcularGanhoFadigaDinamico } from '../core/fadiga';

// 🛡️ Escudos e Vida Temporária (core/escudos.js) de OUTRO personagem: tira do escudo dele o que der do Dano FINAL (escala exibida) e grava só
// o campo `escudos` (null apaga). Usa a ficha mais recente do store. Devolve { restante, absorvido, texto }; sem escudos, nada é gravado.
export function absorverEmPersonagem(nome, ficha, danoExibido, nomeNoFeed = '') {
    const fresca = (useStore.getState().personagens || {})[nome] || ficha;
    const r = absorverDano(fresca, danoExibido);
    if (!(r.absorvido > 0)) return { restante: Math.max(0, Number(danoExibido) || 0), absorvido: 0, texto: '' };
    salvarCamposPersonagem(nome, { escudos: r.escudosNovos.length > 0 ? r.escudosNovos : null });
    return { restante: r.restante, absorvido: r.absorvido, texto: descreverAbsorcao(nomeNoFeed || nome, r) };
}

// `ficha` = ficha ATUAL do alvo; `vidaFinalBruta` = Vida já reduzida, na escala bruta gravada.
export function gravarDanoEmPersonagem(nome, ficha, vidaFinalBruta, { elemento = null, nivelOverride = null } = {}) {
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

// Grava a Vida do alvo de um Ataque: Dummie (salvarDummie) ou personagem (gravarDanoEmPersonagem).
export function gravarVidaDoAlvo(idAlvo, alvo, novoHpBruto, { elemento = null } = {}) {
    if (!alvo) return;
    if (alvo.isPersonagem) {
        gravarDanoEmPersonagem(alvo.personagemNome, alvo.ficha, novoHpBruto, { elemento });
    } else {
        salvarDummie(idAlvo, { ...alvo, hpAtual: novoHpBruto });
    }
}
