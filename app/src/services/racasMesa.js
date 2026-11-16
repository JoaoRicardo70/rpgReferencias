import useStore, { sanitizarNome } from '../stores/useStore';
import { salvarFichaSilencioso, salvarDummie, salvarCenarioCompleto, salvarCamposPersonagem } from './firebase-sync';
import { getRacas, sanitizarRacas, camposDaRacaNaFicha } from '../core/racas';

// 🧬 Gravação do catálogo de Raças da mesa e da Raça de cada personagem (core/racas.js).
// Única cópia da regra: usada pelo catálogo da aba Mestre (RacasCatalogo) e pelo MapaFormContext. Não depende do Mapa estar aberto:
// lê tudo do store NO MOMENTO da chamada.

// Salva o catálogo (saneado: ids estáveis, limites, ciclos de herança removidos; vazio = apaga o catálogo). Só Mestre/Co-Mestre.
// Devolve a lista salva ou null (sem permissão).
// Remover uma raça deixa referências órfãs e inofensivas (racasAcesso, herdaDe, bio.racaId): ver limparReferenciasDeRaca em core/racas.js.
export function salvarRacasDaMesa(lista) {
    const st = useStore.getState();
    if (!st.isMestre) return null;
    const limpa = sanitizarRacas(lista);
    const novoCenario = JSON.parse(JSON.stringify(st.cenario || {}));
    if (limpa.length === 0) delete novoCenario.racas; else novoCenario.racas = limpa;
    salvarCenarioCompleto(novoCenario);
    return limpa;
}

// Define a Raça de um personagem (grava bio.racaId + bio.raca = nome do catálogo; racaId '' = sem raça). Mestre/Co-Mestre em qualquer um;
// o jogador só na PRÓPRIA ficha. entidade = { id, nome, isDummie }. Devolve true se gravou (id fora do catálogo ou sem permissão = false).
export function definirRacaDoPersonagemDireto(entidade, racaId) {
    if (!entidade) return false;
    const st = useStore.getState();
    const isMestre = !!st.isMestre;
    const catalogo = getRacas(st.cenario);
    const raca = racaId ? catalogo.find(r => r.id === racaId) : null;
    if (racaId && !raca) return false;
    const campos = camposDaRacaNaFicha(raca);
    if (entidade.isDummie) {
        if (!isMestre) return false;
        const d = (st.dummies || {})[entidade.id];
        if (!d) return false;
        salvarDummie(entidade.id, { ...d, bio: { ...(d.bio || {}), racaId: campos['bio/racaId'], raca: campos['bio/raca'] } });
        return true;
    }
    const nome = entidade.id || entidade.nome;
    if (!nome) return false;
    const souEu = sanitizarNome(nome) === sanitizarNome(st.meuNome || '');
    if (!isMestre && !souEu) return false;
    if (souEu) {
        st.updateFicha((f) => { if (!f.bio) f.bio = {}; f.bio.racaId = campos['bio/racaId']; f.bio.raca = campos['bio/raca']; });
        salvarFichaSilencioso();
    } else {
        salvarCamposPersonagem(nome, campos);
    }
    return true;
}
