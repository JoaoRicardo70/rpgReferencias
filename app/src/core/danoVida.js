// ==========================================
// 🩸 PONTO ÚNICO DE DANO NA VIDA — lógica pura sobre o rascunho da ficha (Immer) ou um clone solto.
// Todo lugar que tira Vida de um personagem com ficha passa por aqui: Defesa, Dano Rápido, Ataque, Zonas, estados no turno, aoDesligar.
// Ordem: God Mode (Imunidade total: dano 0, não gasta escudo) -> escudos/vida temporária (se ainda não absorvidos) -> gatilho
// `danoQueZeraria` (fase antes) -> grava a Vida (piso 0) -> gatilhos `vidaAbaixoDe` (fase depois).
// SEM gatilhos e sem Imunidade total o resultado é IDÊNTICO ao de antes (mesma conta, nenhuma chave nova na ficha).
// ==========================================
import { danoExibidoParaBruto } from './vitals.js';
import { absorverNoRascunho } from './escudos.js';
import { coletarGatilhos, avaliarGatilhos } from './gatilhos.js';
import { aplicarAcoesNoRascunho, temImunidadeTotal, dispararEventoNaFicha } from './gatilhosAplicar.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { zenkaiLigado, registrarDanoZenkai } from './zenkai.js';

export { camposParaGravar } from './gatilhosAplicar.js';

// 💥 Zenkai (core/zenkai.js): o dano que de fato reduziu a Vida (bruto) entra na telemetria do portador e o caminho 'combate/zenkai' volta em `caminhos`
// (para gravar em outro jogador). Sem Zenkai ligado não faz nada. Nunca lança.
// ctx.autoInfligido (aoDesligar, danoEmSi, Dano Rápido de si em si): o dano que o próprio personagem causa a si NÃO conta (estados e golpes de outros contam).
function registrarDanoNoZenkai(ficha, danoBrutoEfetivo, vidaMaxBruta, caminhos, autoInfligido) {
    try {
        if (autoInfligido === true || !zenkaiLigado(ficha) || !(danoBrutoEfetivo > 0)) return;
        const max = Number(vidaMaxBruta) > 0 ? Number(vidaMaxBruta) : getVidaMaxBrutaNpc(ficha);
        if (registrarDanoZenkai(ficha, danoBrutoEfetivo, max)) caminhos.add('combate/zenkai');
    } catch (e) { console.error('Zenkai: dano falhou', e); }
}

// Quais gatilhos com `perguntar` (modo opcional) DISPARARIAM com este dano, sem tocar na ficha: simula numa cópia com todos "sim" (rng fixo) e
// devolve [{ chave, nome, fonte }]. `decisoes` já dadas ficam de fora. Rápido: sem nenhum gatilho opcional com `perguntar` nem clona.
export function preverPerguntasDeDano(ficha, danoExibido, ctx = {}) {
    if (!ficha || !ficha.vida) return [];
    const coletados = coletarGatilhos(ficha);
    if (!coletados.some(c => c.gatilho.modo === 'opcional' && c.gatilho.perguntar === true && c.gatilho.armado === true)) return [];
    try {
        const clone = JSON.parse(JSON.stringify(ficha));
        const perguntas = [];
        aplicarDanoNaVida(clone, danoExibido, { ...ctx, perguntas, rng: () => 0 });
        const vistos = new Set();
        return perguntas.filter(p => (vistos.has(p.chave) ? false : vistos.add(p.chave)));
    } catch (e) { console.error('Prever gatilhos falhou', e); return []; }
}

// Gera um id de evento (um por golpe/aplicação). Fora do Immer, para não mudar se o produtor for reexecutado de propósito.
export const novoEventoId = () => `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// aplicarDanoNaVida(ficha, danoExibido, ctx) -> { vidaAntes, vidaNova, restante, textoEscudo, textos, caminhos, imune, anulado }
//   danoExibido: dano na escala da tela (já depois de Reduções). ctx: { nome, nomeEscudo, semEscudo, jaAbsorvido, eventoId, cenaId, vidaMaxBruta }
//   semEscudo: dano direto (aoDesligar); jaAbsorvido: o escudo já foi consumido antes (Ataque em outro jogador) e danoExibido é o que sobrou.
//   profundidade/jaDisparados: cadeia de gatilhos (danoEmSi). golpe: { nivel } = dano de um GOLPE (Ataque/Defesa): depois do dano dispara o evento `atingido`.
//   Fase 3: ctx.decisoes { [chave]: bool } / ctx.perguntas [] (modo opcional + `perguntar`), ctx.atacante { nome } e ctx.rng. Devolve também `externos`
//   (ex.: dano no atacante, que quem chamou aplica na ficha do atacante) e `perguntas` (quando ctx.perguntas é dado, é o próprio array preenchido).
//   `textos` = frases dos gatilhos/imunidade para o feed; `textoEscudo` = a frase da absorção (como sempre foi).
export function aplicarDanoNaVida(ficha, danoExibido, ctx = {}) {
    const res = { vidaAntes: 0, vidaNova: 0, restante: 0, textoEscudo: '', textos: [], caminhos: [], imune: false, anulado: false };
    if (!ficha || !ficha.vida) return res;
    const nome = ctx.nome || '';
    const vidaAntes = Number(ficha.vida.atual) || 0;
    res.vidaAntes = vidaAntes; res.vidaNova = vidaAntes;
    const dano = Math.max(0, Number(danoExibido) || 0);

    // 🛡️ God Mode: ignora TUDO (inclusive Dano Verdadeiro e zonas/estados); não consome escudo nem dispara gatilhos.
    if (temImunidadeTotal(ficha)) {
        res.imune = true;
        if (dano > 0) res.textos.push(`${nome ? `${nome} está` : 'Está'} com Imunidade total: nenhum dano foi sofrido`);
        return res;
    }

    let restante = dano;
    const caminhos = new Set();
    if (!ctx.semEscudo && !ctx.jaAbsorvido) {
        const abs = absorverNoRascunho(ficha, dano, ctx.nomeEscudo || nome || 'Escudo');
        res.textoEscudo = abs.texto; restante = abs.restante;
        if (abs.absorvido > 0) caminhos.add('escudos');
    }
    res.restante = restante;
    const danoBruto = danoExibidoParaBruto(restante);

    const coletados = coletarGatilhos(ficha);
    if (coletados.length === 0) {
        ficha.vida.atual = Math.max(0, vidaAntes - danoBruto);
        registrarDanoNoZenkai(ficha, vidaAntes - ficha.vida.atual, ctx.vidaMaxBruta, caminhos, ctx.autoInfligido);
        res.vidaNova = ficha.vida.atual; res.caminhos = [...caminhos, 'vida/atual'];
        return res;
    }

    const eventoId = ctx.eventoId || undefined; // sem id real do golpe: nada de ultimoEvento
    const cenaId = ctx.cenaId || 'default';
    const vidaMaxBruta = Number(ctx.vidaMaxBruta) > 0 ? Number(ctx.vidaMaxBruta) : getVidaMaxBrutaNpc(ficha);
    const profundidade = Number(ctx.profundidade) || 0;
    const base = { eventoId, cenaId, vidaMaxBruta, profundidade, nome, rng: ctx.rng, escolher: ctx.escolher, decisoes: ctx.decisoes, perguntas: ctx.perguntas, atacante: ctx.atacante, danoRecebido: dano };
    const jaDisparados = Array.isArray(ctx.jaDisparados) ? [...ctx.jaDisparados] : [];
    const aplicar = (avaliacao) => {
        if (avaliacao.acoes.length === 0) return { anulado: false };
        avaliacao.disparados.forEach(d => jaDisparados.push(d.chave));
        const r = aplicarAcoesNoRascunho(ficha, avaliacao.acoes, { ...base, disparados: avaliacao.disparados, jaDisparados: [...jaDisparados] });
        r.textos.forEach(t => res.textos.push(t));
        r.caminhos.forEach(c => caminhos.add(c));
        (r.externos || []).forEach(e => { if (!res.externos) res.externos = []; res.externos.push(e); });
        return { anulado: r.anulado };
    };

    // Fase 'antes': o golpe (já com Reduções e escudo) levaria a Vida a 0 ou menos?
    let anulado = false;
    if (danoBruto > 0) {
        anulado = aplicar(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...base, vidaAntes, vidaDepois: vidaAntes - danoBruto, jaDisparados }, ficha, { coletados })).anulado;
    }
    const vidaMeio = Number(ficha.vida.atual) || 0;
    ficha.vida.atual = anulado ? vidaMeio : Math.max(0, vidaMeio - danoBruto);
    registrarDanoNoZenkai(ficha, vidaMeio - ficha.vida.atual, vidaMaxBruta, caminhos, ctx.autoInfligido);
    caminhos.add('vida/atual');

    // Fase 'depois': a Vida terminou numa faixa nova?
    if (ficha.vida.atual < vidaAntes) {
        aplicar(avaliarGatilhos({ tipo: 'vidaAbaixoDe' }, { ...base, vidaAntes, vidaDepois: ficha.vida.atual, jaDisparados }, ficha, { coletados }));
    }
    // 🎯 Golpe que causou dano (God Mode já saiu antes): evento `atingido` de quem sofreu, com o nível do golpe.
    if (ctx.golpe && danoBruto > 0 && !anulado) {
        const g = dispararEventoNaFicha(ficha, { tipo: 'atingido', nivel: ctx.golpe.nivel || 'normal' }, { cenaId, nome, eventoId: eventoId ? `${eventoId}:atingido` : undefined, profundidade, jaDisparados, rng: ctx.rng, escolher: ctx.escolher, decisoes: ctx.decisoes, perguntas: ctx.perguntas, atacante: ctx.atacante, danoRecebido: dano });
        g.textos.forEach(t => res.textos.push(t));
        g.caminhos.forEach(c => caminhos.add(c));
        (g.externos || []).forEach(e => { if (!res.externos) res.externos = []; res.externos.push(e); });
    }
    res.anulado = anulado; res.vidaNova = ficha.vida.atual; res.caminhos = [...caminhos];
    return res;
}
