// ==========================================
// 🧬 RAÇAS DA MESA — lógica pura (sem React, sem Firebase). Catálogo em cenario.racas = [{ id, nome, icone, apelidos[], herdaDe }]
// (Mestre/Co-Mestre gerenciam) e o acesso às Habilidades de Raça (categoria `habilidadeRaca`, poder.racasAcesso = [idsDeRaça]).
//
// Regras:
//  - A Raça da ficha continua guardando o NOME em ficha.bio.raca (compatibilidade); ficha.bio.racaId guarda o id escolhido.
//    Texto livre que não casa com nenhuma raça (id, nome ou apelido, sem acento/caixa) é "Raça não cadastrada": NÃO tem acesso a nenhuma Habilidade de Raça.
//  - `herdaDe` = id de outra raça (ou ''): quem herda tem o acesso da raça-mãe, transitivamente (Meio-Saiyajin herda de Saiyajin).
//  - racasAcesso vazio/ausente = ninguém tem acesso (só o Mestre concede, como exceção: poder.racaExcecao = true).
//  - Remover uma raça do catálogo NÃO apaga nada nas fichas: referências em racasAcesso/herdaDe/bio.racaId ficam ÓRFÃS e inofensivas
//    (id que não existe no catálogo nunca dá acesso e é ignorado ao resolver a raça). `limparReferenciasDeRaca` faz a faxina quando o Mestre quiser.
//  - Se a Raça do personagem mudar depois, ele NÃO perde a habilidade: ganha um selo derivado (poderRacaIncompativel), nada é gravado.
//  - `descendeDe` = genealogia (id da raça de origem). Separado de `herdaDe`. Raça com `acessoTotalDescendentes` (Primordial) acessa as Habilidades de
//    TODAS as descendentes (transitivo por descendeDe) além das próprias; as descendentes NÃO ganham as da Primordial (a menos que herdem via herdaDe).
//  - Composição racial (mestiços / DNA): ficha.bio.composicaoRacial = [{ racaId, percentual 0-100, origem 'nativa'|'adquirida', fonte? }]. Ausente/vazia =
//    derivada: só a Raça principal a 100%. Cada Habilidade de Raça tem `percentualMinimo` (0-100): o personagem só a usa se o percentual na Raça que dá o
//    acesso for >= mínimo. Os percentuais são independentes (não somam 100). Habilidade com `bloqueio.ativo` (Mestre) ou sem Domínio fica 🔒 bloqueada.
//  - LIMITAÇÃO: o bloqueio impede LIGAR/USAR (toggle, disparo, ataque, custo por turno). Efeitos PASSIVOS (efeitosPassivos) de uma habilidade bloqueada
//    continuam sendo somados pelos resolvedores de atributos (core/attributes.js não conhece o cenário); ao bloquear manualmente, o serviço também a desliga.
// ==========================================
import { idCategoriaPoder } from './categoriasPoder';

export const LIMITE_RACAS = 60;
export const LIMITE_NOME_RACA = 40;
export const LIMITE_APELIDOS_RACA = 8;
export const LIMITE_APELIDO_RACA = 40;
export const ICONE_RACA_PADRAO = '🧬';
export const ID_CATEGORIA_HABILIDADE_RACA = 'habilidadeRaca';
export const SELO_RACA_INCOMPATIVEL = '⚠️ Raça incompatível';
export const SELO_BLOQUEADA = '🔒 Bloqueada';
export const PERCENTUAL_RACA_ADQUIRIDA_PADRAO = 10;
export const LIMITE_HISTORICO_COMPOSICAO = 50;
export const LIMITE_COMPOSICAO_RACIAL = 20;
export const LIMITE_PEDIDOS_RACA = 20;
// Modelos de poder (core/modelosPoder.js) que são Habilidades de Raça (migração das fichas antigas).
export const MODELOS_HABILIDADE_RACA = ['zenkai'];

const textoSimples = (v, limite) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, limite);

// Nome/apelido comparável: sem acento, sem caixa, espaços colapsados.
export function normalizarNomeRaca(valor) {
    return String(valor == null ? '' : valor)
        .normalize('NFKC').replace(/[​-‏⁠﻿]/g, '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ').trim().toLowerCase();
}

export function slugRaca(texto) {
    return normalizarNomeRaca(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

// Id novo e único (slug do nome; 'raca' se vazio) que não colide com `existentes` (lista de raças ou de ids).
export function gerarIdRaca(nome, existentes = []) {
    const usados = new Set((Array.isArray(existentes) ? existentes : []).map(e => (e && typeof e === 'object' ? e.id : e)));
    const base = slugRaca(nome) || 'raca';
    let id = base; let n = 2;
    while (usados.has(id)) { id = `${base}-${n}`; n += 1; }
    return id;
}

const comoLista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));

function sanitizarApelidos(brutos, nome) {
    const vistos = new Set([normalizarNomeRaca(nome)]);
    const saida = [];
    comoLista(brutos).forEach((a) => {
        if (saida.length >= LIMITE_APELIDOS_RACA) return;
        const t = textoSimples(a, LIMITE_APELIDO_RACA);
        const n = normalizarNomeRaca(t);
        if (!t || vistos.has(n)) return;
        vistos.add(n);
        saida.push(t);
    });
    return saida;
}

// Lista saneada: descarta sem nome, no máximo LIMITE_RACAS, ids únicos e estáveis (id válido é mantido; senão slug do nome),
// apelidos limpos, herdaDe inexistente/auto-herança/ciclo removidos. Nomes repetidos são mantidos (ids diferentes); a resolução por nome pega a primeira.
export function sanitizarRacas(lista) {
    const usados = new Set();
    const saida = [];
    comoLista(lista).forEach((b) => {
        if (saida.length >= LIMITE_RACAS || !b || typeof b !== 'object') return;
        const nome = textoSimples(b.nome, LIMITE_NOME_RACA);
        if (!nome) return;
        let id = typeof b.id === 'string' ? slugRaca(b.id) : '';
        if (!id || usados.has(id)) id = gerarIdRaca(nome, [...usados]);
        usados.add(id);
        const icone = typeof b.icone === 'string' && b.icone.trim() ? [...b.icone.trim()].slice(0, 4).join('') : ICONE_RACA_PADRAO;
        saida.push({ id, nome, icone, apelidos: sanitizarApelidos(b.apelidos, nome), herdaDe: typeof b.herdaDe === 'string' ? b.herdaDe.trim() : '', descendeDe: typeof b.descendeDe === 'string' ? b.descendeDe.trim() : '', acessoTotalDescendentes: b.acessoTotalDescendentes === true });
    });
    const ids = new Set(saida.map(r => r.id));
    saida.forEach((r) => { if (r.herdaDe === r.id || !ids.has(r.herdaDe)) r.herdaDe = ''; if (r.descendeDe === r.id || !ids.has(r.descendeDe)) r.descendeDe = ''; });
    const porId = new Map(saida.map(r => [r.id, r]));
    // Ciclo de genealogia (descendeDe): mesma regra do herdaDe.
    saida.forEach((r) => {
        let atual = r.descendeDe; const vistos = new Set([r.id]);
        while (atual) {
            if (vistos.has(atual)) { r.descendeDe = ''; break; }
            vistos.add(atual);
            atual = porId.get(atual) ? porId.get(atual).descendeDe : '';
        }
    });
    // Ciclo: se seguir a cadeia a partir da mãe volta para a própria raça, esta perde o herdaDe (a ordem da lista decide quem quebra).
    saida.forEach((r) => {
        let atual = r.herdaDe; const vistos = new Set([r.id]);
        while (atual) {
            if (vistos.has(atual)) { r.herdaDe = ''; break; }
            vistos.add(atual);
            atual = porId.get(atual) ? porId.get(atual).herdaDe : '';
        }
    });
    return saida;
}

// Raças do cenário (já saneadas). Sem catálogo = [].
// Cache por referência de cenario.racas (o store troca a referência a cada mudança): não resaneia a cada render. NÃO mutar o resultado.
const CACHE_RACAS = new WeakMap();
export function getRacas(cenario) {
    const bruto = cenario && cenario.racas;
    if (!bruto || typeof bruto !== 'object') return sanitizarRacas(bruto);
    let r = CACHE_RACAS.get(bruto);
    if (!r) { r = sanitizarRacas(bruto); CACHE_RACAS.set(bruto, r); }
    return r;
}

// Quantas Raças que AINDA existem no catálogo têm acesso (ids órfãos não contam).
export function contarRacasComAcesso(cenario, poder) {
    const racas = getRacas(cenario);
    return idsDeAcesso(poder).filter(id => racas.some(r => r.id === id)).length;
}

const acharPorNome = (racas, texto) => {
    const n = normalizarNomeRaca(texto);
    if (!n) return null;
    return racas.find(r => normalizarNomeRaca(r.nome) === n) || racas.find(r => r.apelidos.some(a => normalizarNomeRaca(a) === n)) || null;
};

// Raça de uma ficha: { id, nome, cadastrada }. Primeiro bio.racaId (existente no catálogo; renomear a raça não quebra ninguém),
// depois o texto de bio.raca por nome/apelido. Sem casar: { id: '', nome: texto, cadastrada: false }.
export function resolverRaca(cenario, ficha) {
    const racas = getRacas(cenario);
    const bio = (ficha && ficha.bio) || {};
    const racaId = typeof bio.racaId === 'string' ? bio.racaId.trim() : '';
    const porId = racaId ? racas.find(r => r.id === racaId) : null;
    const achada = porId || acharPorNome(racas, bio.raca);
    if (achada) return { id: achada.id, nome: achada.nome, cadastrada: true };
    return { id: '', nome: textoSimples(bio.raca, LIMITE_NOME_RACA), cadastrada: false };
}

// Ids das raças-mãe (mãe, avó...), sem a própria raça; à prova de ciclo.
export function ancestraisDaRaca(cenario, id) {
    const porId = new Map(getRacas(cenario).map(r => [r.id, r]));
    const saida = []; const vistos = new Set([id]);
    let atual = porId.get(id);
    while (atual && atual.herdaDe && !vistos.has(atual.herdaDe)) {
        vistos.add(atual.herdaDe);
        saida.push(atual.herdaDe);
        atual = porId.get(atual.herdaDe);
    }
    return saida;
}

export function ehHabilidadeDeRaca(poder) {
    return !!poder && idCategoriaPoder(poder.categoria) === ID_CATEGORIA_HABILIDADE_RACA;
}

const idsDeAcesso = (poder) => (poder && Array.isArray(poder.racasAcesso) ? poder.racasAcesso.filter(i => typeof i === 'string' && i) : []);

// Ids das raças que descendem (transitivo por descendeDe) da raça `id`, sem ela; à prova de ciclo.
export function descendentesDaRaca(cenario, id) {
    const racas = getRacas(cenario);
    const saida = []; const vistos = new Set([id]);
    let fila = [id];
    while (fila.length) {
        const prox = [];
        fila.forEach((pai) => {
            racas.forEach((r) => { if (r.descendeDe === pai && !vistos.has(r.id)) { vistos.add(r.id); saida.push(r.id); prox.push(r.id); } });
        });
        fila = prox;
    }
    return saida;
}

// Raças cujas Habilidades uma entrada da composição acessa: a própria + ancestrais por herdaDe + (se acessoTotalDescendentes) todas as descendentes por descendeDe.
// `entrada` = id da raça ou { racaId }. Raça fora do catálogo = [].
export function racasEfetivas(cenario, entrada) {
    const id = entrada && typeof entrada === 'object' ? entrada.racaId : entrada;
    const raca = typeof id === 'string' ? getRacas(cenario).find(r => r.id === id) : null;
    if (!raca) return [];
    const saida = [raca.id, ...ancestraisDaRaca(cenario, raca.id)];
    if (raca.acessoTotalDescendentes) descendentesDaRaca(cenario, raca.id).forEach((d) => { if (!saida.includes(d)) saida.push(d); });
    return saida;
}

const limitarPercentual = (v, padrao = 0) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return padrao;
    return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
};

// Percentual mínimo de uma Habilidade de Raça (0-100, padrão 0).
export const percentualMinimoDoPoder = (poder) => limitarPercentual(poder && poder.percentualMinimo, 0);

// Composição racial NORMALIZADA de uma ficha: [{ racaId, nome, icone, percentual, origem, fonte }].
// Explícita (bio.composicaoRacial) = fonte de verdade: só ids do catálogo, sem repetir raça (vale a primeira), percentual 0-100, origem 'nativa'|'adquirida'.
// Ausente/vazia/sem nenhuma entrada válida = derivada: a Raça principal (resolverRaca) a 100%. Sem Raça cadastrada = [].
export function getComposicaoRacial(cenario, ficha) {
    const racas = getRacas(cenario);
    const bio = (ficha && ficha.bio) || {};
    const saida = []; const vistos = new Set();
    comoLista(bio.composicaoRacial).forEach((e) => {
        if (!e || typeof e !== 'object' || saida.length >= LIMITE_COMPOSICAO_RACIAL) return;
        const id = typeof e.racaId === 'string' ? e.racaId.trim() : '';
        const raca = id ? racas.find(r => r.id === id) : null;
        if (!raca || vistos.has(raca.id)) return;
        vistos.add(raca.id);
        const origem = e.origem === 'adquirida' ? 'adquirida' : 'nativa';
        const item = { racaId: raca.id, nome: raca.nome, icone: raca.icone, percentual: limitarPercentual(e.percentual, origem === 'adquirida' ? PERCENTUAL_RACA_ADQUIRIDA_PADRAO : 100), origem };
        const fonte = textoSimples(e.fonte, 80);
        if (fonte) item.fonte = fonte;
        saida.push(item);
    });
    if (saida.length) return saida;
    const principal = resolverRaca(cenario, ficha);
    if (!principal.cadastrada) return [];
    const raca = racas.find(r => r.id === principal.id);
    return [{ racaId: principal.id, nome: principal.nome, icone: raca ? raca.icone : ICONE_RACA_PADRAO, percentual: 100, origem: 'nativa' }];
}

// A ficha tem composição racial gravada (explícita)?
export const temComposicaoExplicita = (ficha) => comoLista(ficha && ficha.bio && ficha.bio.composicaoRacial).length > 0;

// Pedidos de Raça (Manipulação de DNA) pendentes de toda a mesa: [{ id (do personagem), nome, pedido: { id, racaId, motivo, ts } }].
// A ficha do próprio Mestre/jogador logado vem de minhaFicha (os outros, de personagens). Pura: o painel e o contador do atalho usam a mesma lista.
export function listarPedidosRaca({ personagens, meuNome, minhaFicha } = {}) {
    const saida = [];
    const nomes = new Set(Object.keys(personagens || {}));
    if (meuNome) nomes.add(meuNome);
    nomes.forEach((id) => {
        const ficha = id === meuNome ? minhaFicha : (personagens || {})[id];
        if (!ficha || typeof ficha !== 'object') return;
        const nome = (ficha.bio && ficha.bio.nome) || id;
        comoLista(ficha.bio && ficha.bio.pedidosRaca).forEach((p) => {
            if (p && typeof p === 'object' && typeof p.id === 'string' && typeof p.racaId === 'string') {
                // semPoderDNA: pedido forjado (o dono não tem nenhum poder marcado manipulaDNA): o Mestre não consegue aprová-lo.
                saida.push({ id, nome, pedido: p, semPoderDNA: !comoLista(ficha.poderes).some(x => x && x.manipulaDNA === true) });
            }
        });
    });
    return saida;
}

// Alinha a composição explícita com a Raça PRINCIPAL: se a principal (já gravada em bio.racaId/bio.raca) é do catálogo e não está na composição,
// devolve a lista com ela acrescentada como nativa a 100%; senão null (nada a fazer; sem composição explícita nunca mexe). Regra simples e sem perguntas.
export function composicaoComPrincipal(cenario, ficha) {
    if (!temComposicaoExplicita(ficha)) return null;
    const principal = resolverRaca(cenario, ficha);
    if (!principal.cadastrada) return null;
    const lista = comoLista(ficha.bio.composicaoRacial).filter(Boolean);
    if (lista.some(e => e && e.racaId === principal.id)) return null;
    if (lista.length >= LIMITE_COMPOSICAO_RACIAL) return null;
    return [...lista.map(e => ({ ...e })), { racaId: principal.id, percentual: 100, origem: 'nativa' }];
}

// Domínio da Raça = o próprio percentual do personagem nela (0 se não tem a Raça na composição).
export function dominioDaRaca(cenario, ficha, racaId) {
    const e = getComposicaoRacial(cenario, ficha).find(x => x.racaId === racaId);
    return e ? e.percentual : 0;
}

// Entradas da composição que dão acesso ao poder: [{ racaId, nome, percentual, minimo, via (id da raça de acesso que casou), atingeMinimo }].
// Poder que não é Habilidade de Raça = [] (não há restrição; ver racaTemAcesso). `ignorarPercentual` mantém só o critério da Raça.
export function racasQueDaoAcesso(cenario, ficha, poder, { ignorarPercentual = false } = {}) {
    if (!ehHabilidadeDeRaca(poder)) return [];
    const acesso = idsDeAcesso(poder);
    if (acesso.length === 0) return [];
    const minimo = percentualMinimoDoPoder(poder);
    const saida = [];
    getComposicaoRacial(cenario, ficha).forEach((e) => {
        const via = racasEfetivas(cenario, e).find(i => acesso.includes(i));
        if (!via) return;
        const atingeMinimo = e.percentual >= minimo;
        if (ignorarPercentual || atingeMinimo) saida.push({ racaId: e.racaId, nome: e.nome, percentual: e.percentual, minimo, via, atingeMinimo });
    });
    return saida;
}

// Alguma Raça da composição (ou ancestral/descendente por acesso total) está em poder.racasAcesso, IGNORANDO o percentual mínimo?
export const racaTemAcessoPelaRaca = (cenario, ficha, poder) => !ehHabilidadeDeRaca(poder) || racasQueDaoAcesso(cenario, ficha, poder, { ignorarPercentual: true }).length > 0;

// Acesso COMPLETO: a Raça dá acesso E o percentual dela alcança o mínimo da Habilidade. Poder que não é Habilidade de Raça não tem restrição (true).
export function racaTemAcesso(cenario, ficha, poder) {
    if (!ehHabilidadeDeRaca(poder)) return true;
    return racasQueDaoAcesso(cenario, ficha, poder).length > 0;
}

export const seloDominioInsuficiente = (percentual, minimo) => `🔒 Domínio insuficiente (${percentual}% de ${minimo}%)`;

// Estado de bloqueio (derivado; nada é gravado). Só vale para Habilidades de Raça.
//  manual: poder.bloqueio.ativo (o Mestre desbloqueia = "Despertar"); a exceção do Mestre (racaExcecao) NÃO o ignora.
//  percentual: a Raça dá acesso mas o maior percentual entre as que dão acesso está abaixo do mínimo; a exceção do Mestre ignora este.
// Devolve { bloqueado, motivo, requisito, origem: 'manual'|'percentual'|'', selo, percentual?, minimo? }.
export function poderBloqueado(cenario, ficha, poder) {
    const livre = { bloqueado: false, motivo: '', requisito: '', origem: '', selo: '' };
    if (!ehHabilidadeDeRaca(poder)) return livre;
    const b = poder.bloqueio;
    if (b && typeof b === 'object' && b.ativo === true) {
        const requisito = textoSimples(b.requisito, 300);
        const motivoManual = textoSimples(b.motivo, 300);
        const partes = [];
        if (motivoManual) partes.push(motivoManual);
        if (requisito) partes.push(`Para desbloquear: ${requisito}`);
        return { bloqueado: true, motivo: partes.join(' ') || 'Habilidade ainda não despertada.', requisito, origem: 'manual', selo: SELO_BLOQUEADA };
    }
    if (poder.racaExcecao === true) return livre;
    const minimo = percentualMinimoDoPoder(poder);
    if (minimo <= 0) return livre;
    const todas = racasQueDaoAcesso(cenario, ficha, poder, { ignorarPercentual: true });
    if (todas.length === 0 || todas.some(e => e.atingeMinimo)) return livre;
    const melhor = todas.reduce((a, e) => (e.percentual > a.percentual ? e : a), todas[0]);
    return {
        bloqueado: true,
        motivo: `Domínio insuficiente: ${melhor.nome} em ${melhor.percentual}%, o mínimo é ${minimo}%. Pratique para elevar o percentual.`,
        requisito: `${minimo}% de ${melhor.nome}`,
        origem: 'percentual', selo: seloDominioInsuficiente(melhor.percentual, minimo), percentual: melhor.percentual, minimo,
    };
}

// Ponto ÚNICO de "pode ser ligada/usada?": false só para Habilidade de Raça bloqueada. Qualquer outro poder (ou entrada vazia) = true.
export function poderUsavel(ficha, cenario, poder) {
    if (!poder) return true;
    return !poderBloqueado(cenario, ficha, poder).bloqueado;
}

// "Saiyajin, Híbrido" — só raças que ainda existem no catálogo (órfãs são ignoradas). Vazio = só o Mestre concede.
export function racasComAcessoTexto(cenario, poder) {
    const racas = getRacas(cenario);
    const nomes = idsDeAcesso(poder).map(id => (racas.find(r => r.id === id) || {}).nome).filter(Boolean);
    return nomes.length ? nomes.join(', ') : 'nenhuma Raça (só o Mestre concede, como exceção)';
}

// Motivo (português) de a raça não ter acesso; '' quando tem (ou quando o poder não é Habilidade de Raça).
export function motivoSemAcesso(cenario, ficha, poder) {
    if (racaTemAcesso(cenario, ficha, poder)) return '';
    const raca = resolverRaca(cenario, ficha);
    const nomePoder = poder && poder.nome ? `"${poder.nome}"` : 'esta Habilidade de Raça';
    const com = `Raças com acesso: ${racasComAcessoTexto(cenario, poder)}.`;
    // Tem a Raça, mas o percentual dela está abaixo do mínimo da Habilidade.
    const porRaca = racasQueDaoAcesso(cenario, ficha, poder, { ignorarPercentual: true });
    if (porRaca.length > 0) {
        const m = porRaca.reduce((a, e) => (e.percentual > a.percentual ? e : a), porRaca[0]);
        return `Domínio insuficiente para ${nomePoder}: ${m.nome} em ${m.percentual}%, abaixo do mínimo de ${m.minimo}%.`;
    }
    if (!raca.cadastrada && temComposicaoExplicita(ficha) && getComposicaoRacial(cenario, ficha).length > 0) {
        return `Nenhuma das Raças deste personagem tem acesso a ${nomePoder}. ${com}`;
    }
    if (!raca.cadastrada) {
        const quem = raca.nome ? `A Raça "${raca.nome}" não está cadastrada na mesa` : 'Este personagem não tem Raça definida';
        return `${quem}, então não tem acesso a ${nomePoder}. ${com}`;
    }
    return `A Raça ${raca.nome} não tem acesso a ${nomePoder}. ${com}`;
}

// Selo derivado (nada é gravado): Habilidade de Raça sem exceção em que NENHUMA Raça da composição dá acesso (o percentual baixo é outro selo: poderBloqueado).
export function poderRacaIncompativel(cenario, ficha, poder) {
    return ehHabilidadeDeRaca(poder) && poder.racaExcecao !== true && !racaTemAcessoPelaRaca(cenario, ficha, poder);
}

export const MENSAGEM_JOGADOR_NAO_CRIA_HABILIDADE_RACA = 'Habilidades de Raça são concedidas pelo Mestre: peça a ele para criar ou conceder esta habilidade.';
export const MENSAGEM_JOGADOR_NAO_EDITA_RACAS_ACESSO = 'Só o Mestre pode mudar quais Raças têm acesso a uma Habilidade de Raça: a lista foi mantida.';

// Marca/limpa a exceção num poder (muta o objeto recebido) depois da decisão: sem acesso ⇒ racaExcecao true; com acesso ⇒ remove a marca.
export function aplicarExcecaoRaca(poder, concedeuExcecao) {
    if (!ehHabilidadeDeRaca(poder)) return poder;
    if (concedeuExcecao) poder.racaExcecao = true; else delete poder.racaExcecao;
    return poder;
}

// ids de raça válidos (limpos, sem repetição) para gravar em poder.racasAcesso.
export function normalizarRacasAcesso(lista) {
    const saida = [];
    comoLista(lista).forEach((i) => { if (typeof i === 'string' && i.trim() && !saida.includes(i.trim())) saida.push(i.trim()); });
    return saida;
}

// racasAcesso padrão ao criar uma Habilidade de Raça para uma ficha: a raça cadastrada dela (senão [] ⇒ exige exceção).
export function racasAcessoPadraoParaFicha(cenario, ficha) {
    const r = resolverRaca(cenario, ficha);
    return r.cadastrada ? [r.id] : [];
}

// Faxina para o Mestre: tira a raça do catálogo e todas as referências a ela (herdaDe das outras raças e racasAcesso dos poderes dados).
// Puro: devolve cópias { racas, poderes, alterados }. Não mexe em bio.racaId de fichas (id órfão é ignorado por resolverRaca).
export function limparReferenciasDeRaca(idRaca, { racas = [], poderes = [], biblioteca = [] } = {}) {
    let alterados = 0;
    const novasRacas = sanitizarRacas(racas).filter(r => r.id !== idRaca).map((r) => {
        if (r.herdaDe === idRaca || r.descendeDe === idRaca) { alterados += 1; return { ...r, herdaDe: r.herdaDe === idRaca ? '' : r.herdaDe, descendeDe: r.descendeDe === idRaca ? '' : r.descendeDe }; }
        return r;
    });
    const novosPoderes = comoLista(poderes).map((p) => {
        if (p && Array.isArray(p.racasAcesso) && p.racasAcesso.includes(idRaca)) {
            alterados += 1;
            return { ...p, racasAcesso: p.racasAcesso.filter(i => i !== idRaca) };
        }
        return p;
    });
    // Biblioteca de Habilidades de Raça (cenario.bibliotecaRacial): a Raça sai dos racasAcesso das entradas.
    const novaBiblioteca = comoLista(biblioteca).map((e) => {
        if (e && Array.isArray(e.racasAcesso) && e.racasAcesso.includes(idRaca)) {
            alterados += 1;
            return { ...e, racasAcesso: e.racasAcesso.filter(i => i !== idRaca) };
        }
        return e;
    });
    return { racas: novasRacas, poderes: novosPoderes, biblioteca: novaBiblioteca, alterados };
}

// Campos que a seleção de Raça grava (caminhos relativos para salvarCamposPersonagem). raca = item do catálogo ou null (sem raça).
export const camposDaRacaNaFicha = (raca) => ({ 'bio/racaId': raca ? raca.id : '', 'bio/raca': raca ? raca.nome : '' });

// Migração das fichas antigas: poderes de modelo de Habilidade de Raça (Zenkai) na categoria 'habilidade' passam a 'habilidadeRaca',
// já com exceção concedida (racaExcecao) e racasAcesso [] — sem selo de incompatibilidade. Devolve { poderes, mudou } (mesmo array se nada mudou).
export function migrarHabilidadesDeRaca(poderes) {
    if (!Array.isArray(poderes)) return { poderes, mudou: false };
    let mudou = false;
    const novos = poderes.map((p) => {
        if (!p || typeof p !== 'object') return p;
        const m = p.modelo;
        const ehModeloRacial = !!m && typeof m === 'object' && (MODELOS_HABILIDADE_RACA.includes(m.id) || m.habilidadeRaca === true);
        if (!ehModeloRacial || idCategoriaPoder(p.categoria) !== 'habilidade' || String(p.categoria).trim() === '') return p;
        mudou = true;
        return { ...p, categoria: ID_CATEGORIA_HABILIDADE_RACA, racaExcecao: true, racasAcesso: Array.isArray(p.racasAcesso) ? p.racasAcesso : [] };
    });
    return { poderes: mudou ? novos : poderes, mudou };
}

// Ao editar o TEXTO da Raça nos formulários antigos (Ficha/Narrativa): se o texto não mudou, o racaId fica; se mudou, vale o id da raça
// do catálogo que casa (nome/apelido) ou '' (texto livre = Raça não cadastrada). Assim o racaId nunca fica velho em relação ao nome digitado.
export function racaIdAposEdicaoDeTexto(cenario, racaIdAtual, textoAntigo, textoNovo) {
    const atual = typeof racaIdAtual === 'string' ? racaIdAtual : '';
    if (String(textoAntigo == null ? '' : textoAntigo) === String(textoNovo == null ? '' : textoNovo)) return atual;
    const achada = acharPorNome(getRacas(cenario), textoNovo);
    return achada ? achada.id : '';
}

// LIMITE ACEITO (documentado): o banco não tem regras que impeçam escrita de outros jogadores nas fichas. A restrição de Raça vale na INTERFACE:
// autodeclaração (o jogador escolher a própria Raça), importação de ficha/backup por JSON e escrita direta no Firebase NÃO são barradas aqui.
// O backup/importação de ficha (backupFicha.js) de propósito não saneia racasAcesso/racaExcecao; o que o app protege é o fluxo normal
// (ensinar/copiar, importador IA, Sexta-Feira, modelos) e o selo de incompatibilidade, que é derivado.
