import useStore, { sanitizarNome } from '../stores/useStore';
import { salvarFichaSilencioso, salvarDummie, salvarCenarioCompleto, salvarCamposPersonagem } from './firebase-sync';
import { desligarHabilidadesBloqueadas, limparVisibilidadeOrfa } from './composicaoRacial';
import { limparRacaDaBiblioteca } from '../core/bibliotecaRacial';
import { getRacas, sanitizarRacas, camposDaRacaNaFicha, composicaoComPrincipal, resolverRaca } from '../core/racas';
import { nivelDaRaca, CHAVE_PRINCIPAL } from '../core/racasVisibilidade';

// 🧬 Gravação do catálogo de Raças da mesa e da Raça de cada personagem (core/racas.js).
// Única cópia da regra: usada pelo catálogo da aba Mestre (RacasCatalogo) e pelo MapaFormContext. Não depende do Mapa estar aberto:
// lê tudo do store NO MOMENTO da chamada.

// Salva o catálogo (saneado: ids estáveis, limites, ciclos de herança removidos; vazio = apaga o catálogo). Só Mestre/Co-Mestre.
// Devolve a lista salva ou null (sem permissão).
// Remover uma raça deixa referências órfãs e inofensivas (racasAcesso, herdaDe, bio.racaId): ver limparReferenciasDeRaca em core/racas.js.
// `opcoes.removida` = id da Raça que acabou de sair do catálogo: ela também sai dos racasAcesso da biblioteca de Habilidades de Raça (na mesma gravação).
export function salvarRacasDaMesa(lista, opcoes = {}) {
    const st = useStore.getState();
    if (!st.isMestre) return null;
    const limpa = sanitizarRacas(lista);
    const novoCenario = JSON.parse(JSON.stringify(st.cenario || {}));
    if (limpa.length === 0) delete novoCenario.racas; else novoCenario.racas = limpa;
    if (opcoes && opcoes.removida && novoCenario.bibliotecaRacial) {
        novoCenario.bibliotecaRacial = limparRacaDaBiblioteca(opcoes.removida, novoCenario.bibliotecaRacial).biblioteca;
    }
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
        const bioNova = { ...(d.bio || {}), racaId: campos['bio/racaId'], raca: campos['bio/raca'] };
        const compD = !isMestre ? null : composicaoComPrincipal(st.cenario, { bio: bioNova });
        if (compD) bioNova.composicaoRacial = compD;
        // Trocar a Raça pode bloquear Habilidades de Raça ligadas (acesso/percentual): desliga (ver desligarHabilidadesBloqueadas).
        const novoD = JSON.parse(JSON.stringify({ ...d, bio: bioNova }));
        desligarHabilidadesBloqueadas(novoD, st.cenario, { tipo: 'dummie', nome: d.nome || entidade.id });
        limparVisibilidadeOrfa(novoD, st.cenario);
        salvarDummie(entidade.id, novoD);
        return true;
    }
    const nome = entidade.id || entidade.nome;
    if (!nome) return false;
    const souEu = sanitizarNome(nome) === sanitizarNome(st.meuNome || '');
    if (!isMestre && !souEu) return false;
    // Raça principal 'secreta' (só o Mestre sabe): o jogador não a troca (nem a vê). Só exibição, mas a interface e o serviço concordam.
    if (!isMestre && souEu && st.minhaFicha) {
        const atual = resolverRaca(st.cenario, st.minhaFicha);
        if (nivelDaRaca(st.minhaFicha, atual.id || CHAVE_PRINCIPAL) === 'secreta') return false;
    }
    if (souEu) {
        st.updateFicha((f) => {
            if (!f.bio) f.bio = {};
            f.bio.racaId = campos['bio/racaId']; f.bio.raca = campos['bio/raca'];
            // Só Mestre/Co-Mestre alinha a composição à nova principal; o jogador trocando a própria Raça não se concede percentual (o Mestre usa "Incluir a Raça principal").
            const comp = isMestre ? composicaoComPrincipal(st.cenario, f) : null;
            if (comp) f.bio.composicaoRacial = comp;
            desligarHabilidadesBloqueadas(f, st.cenario, { tipo: 'eu', nome: st.meuNome });
            limparVisibilidadeOrfa(f, st.cenario);
        });
        salvarFichaSilencioso();
    } else {
        // Composição explícita: a nova principal entra nela (nativa, 100%) para não ficar desalinhada.
        const pers = st.personagens || {};
        const outra = pers[nome] || pers[Object.keys(pers).find(k => sanitizarNome(k) === sanitizarNome(nome))];
        const comp = outra && isMestre ? composicaoComPrincipal(st.cenario, { bio: { ...(outra.bio || {}), racaId: campos['bio/racaId'], raca: campos['bio/raca'] } }) : null;
        const todos = comp ? { ...campos, 'bio/composicaoRacial': comp } : { ...campos };
        if (outra) {
            const clone = JSON.parse(JSON.stringify(outra));
            clone.bio = { ...(clone.bio || {}), racaId: campos['bio/racaId'], raca: campos['bio/raca'], ...(comp ? { composicaoRacial: comp } : {}) };
            desligarHabilidadesBloqueadas(clone, st.cenario, { tipo: 'outro', nome });
            if (limparVisibilidadeOrfa(clone, st.cenario)) todos['bio/racaVisibilidade'] = clone.bio.racaVisibilidade === undefined ? null : clone.bio.racaVisibilidade;
            (Array.isArray(clone.poderes) ? clone.poderes : []).forEach((p, i) => { if (p && p.ativa === false && outra.poderes && outra.poderes[i] && outra.poderes[i].ativa) todos[`poderes/${i}/ativa`] = false; });
        }
        salvarCamposPersonagem(nome, todos);
    }
    return true;
}
