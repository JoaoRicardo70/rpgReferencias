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
import { cenaAtualDaMesa, aplicarDanoNaVidaDaFicha, criarEscolhaDoDono } from './danoVida';
import { aplicarDanoEmPersonagem } from './danoAlvo';
import { danoExibidoParaBruto } from '../core/vitals';
import { combateAtivo as combateAtivoNoCenario } from '../core/combateEstado';
import { aprovarGanhosPermanentesLigado } from '../core/aprovacaoPermanente';

// Congelado: ninguém altera este objeto compartilhado (os chamadores só leem).
const SEM_EFEITO = Object.freeze({ textos: Object.freeze([]), caminhos: Object.freeze([]), chaves: Object.freeze([]), disparou: false });

// ✅ Modo do fimDeLuta para os ganhos permanentes (core/aprovacaoPermanente.js). Decisão explícita do Mestre (ctx.permanente) vale sempre. Sem ela:
// opção desligada = 'converter' (como antes); ligada = 'adiar' se a cena tem combate ativo (o Mestre decide ao encerrar) ou 'limpar' (sem combate).
function ctxDoFim(evento, ctx) {
    if (evento.tipo !== 'fimDeLuta' || (ctx && ctx.permanente)) return ctx;
    const cen = useStore.getState().cenario;
    if (!aprovarGanhosPermanentesLigado(cen)) return ctx;
    return { ...ctx, permanente: combateAtivoNoCenario(cen, (ctx && ctx.cenaId) || cenaAtualDaMesa()) ? 'adiar' : 'limpar' };
}

// Na MINHA ficha. Devolve { textos } (frases para o feed).
export function dispararEventoMeu(evento, ctx = {}) {
    const st = useStore.getState();
    if (!st.minhaFicha || typeof st.updateFicha !== 'function') return SEM_EFEITO;
    try {
        const sempre = evento.tipo === 'fimDeLuta';
        if (!sempre && coletarGatilhos(st.minhaFicha).length === 0) return SEM_EFEITO;
        let r = SEM_EFEITO;
        const escolhaDoDono = criarEscolhaDoDono();
        st.updateFicha((ficha) => { r = dispararEventoNaFicha(ficha, evento, { cenaId: cenaAtualDaMesa(), nome: st.meuNome, escolher: escolhaDoDono, ...ctxDoFim(evento, ctx) }); });
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
        const r = dispararEventoNaFicha(clone, evento, { cenaId: cenaAtualDaMesa(), nome, ...ctxDoFim(evento, ctx) });
        if (r.caminhos.length > 0) salvarCamposPersonagem(nome, camposParaGravar(clone, r.caminhos));
        return r;
    } catch (e) { console.error('Gatilho falhou', e); return SEM_EFEITO; }
}

// Efeitos de gatilhos em OUTRA ficha (`externos` de aplicarDanoNaVida / dispararEvento...): hoje só 'danoNoAtacante' (dano pelo ponto único de dano do atacante:
// God Mode dele zera, escudo dele absorve, gatilhos dele podem disparar). Atacante sem ficha (Dummie / desconhecido) é ignorado com aviso. Devolve textos do feed.
export function aplicarExternosDeGatilhos(externos) {
    const textos = [];
    (Array.isArray(externos) ? externos : []).forEach((e) => {
        if (!e || e.tipo !== 'danoNoAtacante') return;
        const nome = e.atacante && e.atacante.nome;
        const dano = Math.floor(Number(e.dano) || 0);
        if (!nome || dano <= 0) return;
        try {
            const st = useStore.getState();
            if (nome === st.meuNome) {
                let r = null; const escolhaDoDono = criarEscolhaDoDono();
                st.updateFicha((f) => { if (f.vida) r = aplicarDanoNaVidaDaFicha(f, dano, { nome, nomeEscudo: nome, escolher: escolhaDoDono }); });
                salvarFichaSilencioso();
                textos.push(r && r.imune ? `${nome} está com Imunidade total: o dano devolvido não surtiu efeito` : `${nome} sofreu ${dano.toLocaleString('pt-BR')} de dano devolvido por ${e.gatilhoNome || 'um gatilho'}`);
                if (r && r.textos.length > 0 && !r.imune) r.textos.forEach(t => textos.push(t));
                return;
            }
            const fresca = (st.personagens || {})[nome];
            if (!fresca || !fresca.vida) { textos.push(`${e.gatilhoNome || 'Gatilho'}: ${nome} não tem ficha, o dano devolvido foi ignorado`); return; }
            const r = aplicarDanoEmPersonagem(nome, fresca, dano, danoExibidoParaBruto(dano), {});
            textos.push(r.texto || `${nome} sofreu ${dano.toLocaleString('pt-BR')} de dano devolvido por ${e.gatilhoNome || 'um gatilho'}`);
            r.textos.forEach(t => textos.push(`${nome}: ${t}`));
        } catch (err) { console.error('Efeito externo de gatilho falhou', err); }
    });
    return textos;
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
