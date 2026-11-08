// ==========================================
// 🔔 DISPARAR EVENTOS DE GATILHO com o contexto do app (cena da mesa, store, Firebase).
// A lógica é de core/gatilhosAplicar.js > dispararEventoNaFicha. Aqui só se decide em QUAL ficha rodar e como gravar:
//   - minha ficha: dentro de updateFicha + salvarFichaSilencioso (debounce);
//   - ficha de OUTRO jogador: sobre uma cópia da ficha mais fresca do store, gravando só os caminhos tocados (salvarCamposPersonagem).
// Sem gatilhos que casem nada é gravado.
// ==========================================
import useStore from '../stores/useStore';
import { salvarFichaSilencioso, salvarCamposPersonagem } from './firebase-sync';
import { coletarGatilhos } from '../core/gatilhos';
import { dispararEventoNaFicha, camposParaGravar } from '../core/gatilhosAplicar';
import { cenaAtualDaMesa } from './danoVida';

// Congelado: ninguém altera este objeto compartilhado (os chamadores só leem).
const SEM_EFEITO = Object.freeze({ textos: Object.freeze([]), caminhos: Object.freeze([]), chaves: Object.freeze([]), disparou: false });

// Na MINHA ficha. Devolve { textos } (frases para o feed).
export function dispararEventoMeu(evento, ctx = {}) {
    const st = useStore.getState();
    if (!st.minhaFicha || typeof st.updateFicha !== 'function') return SEM_EFEITO;
    try {
        const sempre = evento.tipo === 'fimDeLuta';
        if (!sempre && coletarGatilhos(st.minhaFicha).length === 0) return SEM_EFEITO;
        let r = SEM_EFEITO;
        st.updateFicha((ficha) => { r = dispararEventoNaFicha(ficha, evento, { cenaId: cenaAtualDaMesa(), nome: st.meuNome, ...ctx }); });
        if (r.disparou || r.caminhos.length > 0) salvarFichaSilencioso();
        return r;
    } catch (e) { console.error('Gatilho falhou', e); return SEM_EFEITO; }
}

// Na ficha de OUTRO personagem (ou na minha, se o nome for o meu). Usa a ficha mais fresca do store e grava só os caminhos tocados.
export function dispararEventoEmPersonagem(nome, evento, ctx = {}) {
    const st = useStore.getState();
    if (!nome) return SEM_EFEITO;
    if (nome === st.meuNome) return dispararEventoMeu(evento, ctx);
    const fresca = (st.personagens || {})[nome];
    if (!fresca) return SEM_EFEITO;
    try {
        const sempre = evento.tipo === 'fimDeLuta';
        if (!sempre && coletarGatilhos(fresca).length === 0) return SEM_EFEITO;
        const clone = JSON.parse(JSON.stringify(fresca));
        const r = dispararEventoNaFicha(clone, evento, { cenaId: cenaAtualDaMesa(), nome, ...ctx });
        if (r.caminhos.length > 0) salvarCamposPersonagem(nome, camposParaGravar(clone, r.caminhos));
        return r;
    } catch (e) { console.error('Gatilho falhou', e); return SEM_EFEITO; }
}

// Frase única para o feed ('' se nada disparou).
export const textoDosEventos = (r) => (r && r.textos && r.textos.length > 0 ? `🔔 ${r.textos.join(' · ')}` : '');

// Depois de um teste de acerto: `errou` para quem atacou (se TODOS os alvos escaparam) e `inimigoErrou` para cada alvo-personagem
// que escapou. `alvos` = itens de resolverAcertoNoAlvo ({ nome, acertou, dummieId? }). `atacanteSouEu`: false quando o Mestre age por um NPC.
// Devolve as frases (feed). Sem gatilhos nada é gravado.
export function dispararResultadoDoAcerto(alvos, { atacanteSouEu = true, nomeAtacante = '' } = {}) {
    const textos = [];
    const lista = Array.isArray(alvos) ? alvos : [];
    if (lista.length === 0) return textos;
    const st = useStore.getState();
    if (atacanteSouEu && lista.every(a => a && a.acertou === false)) {
        dispararEventoMeu({ tipo: 'errou' }, { nome: st.meuNome }).textos.forEach(t => textos.push(t));
    }
    lista.forEach((a) => {
        if (!a || a.acertou !== false) return;
        const id = String(a.dummieId || '');
        // Com dummieId, só 'pj:Nome' é personagem (um Dummie com o nome de um jogador NÃO conta); sem dummieId, pelo nome.
        const nome = id ? (id.startsWith('pj:') ? id.slice(3) : '') : (((st.personagens || {})[a.nome] || a.nome === st.meuNome) ? a.nome : '');
        if (!nome || nome === nomeAtacante) return;
        dispararEventoEmPersonagem(nome, { tipo: 'inimigoErrou' }).textos.forEach(t => textos.push(`${nome}: ${t}`));
    });
    return textos;
}
