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
// ==========================================
import { idCategoriaPoder } from './categoriasPoder';

export const LIMITE_RACAS = 60;
export const LIMITE_NOME_RACA = 40;
export const LIMITE_APELIDOS_RACA = 8;
export const LIMITE_APELIDO_RACA = 40;
export const ICONE_RACA_PADRAO = '🧬';
export const ID_CATEGORIA_HABILIDADE_RACA = 'habilidadeRaca';
export const SELO_RACA_INCOMPATIVEL = '⚠️ Raça incompatível';
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
        saida.push({ id, nome, icone, apelidos: sanitizarApelidos(b.apelidos, nome), herdaDe: typeof b.herdaDe === 'string' ? b.herdaDe.trim() : '' });
    });
    const ids = new Set(saida.map(r => r.id));
    saida.forEach((r) => { if (r.herdaDe === r.id || !ids.has(r.herdaDe)) r.herdaDe = ''; });
    const porId = new Map(saida.map(r => [r.id, r]));
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

// A raça do personagem (ou uma raça-mãe dela) está em poder.racasAcesso? Poder que não é Habilidade de Raça não tem restrição (true).
export function racaTemAcesso(cenario, ficha, poder) {
    if (!ehHabilidadeDeRaca(poder)) return true;
    const raca = resolverRaca(cenario, ficha);
    if (!raca.cadastrada) return false;
    const acesso = idsDeAcesso(poder);
    if (acesso.length === 0) return false;
    return [raca.id, ...ancestraisDaRaca(cenario, raca.id)].some(i => acesso.includes(i));
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
    if (!raca.cadastrada) {
        const quem = raca.nome ? `A Raça "${raca.nome}" não está cadastrada na mesa` : 'Este personagem não tem Raça definida';
        return `${quem}, então não tem acesso a ${nomePoder}. ${com}`;
    }
    return `A Raça ${raca.nome} não tem acesso a ${nomePoder}. ${com}`;
}

// Selo derivado (nada é gravado): Habilidade de Raça sem exceção cuja raça atual não tem acesso.
export function poderRacaIncompativel(cenario, ficha, poder) {
    return ehHabilidadeDeRaca(poder) && poder.racaExcecao !== true && !racaTemAcesso(cenario, ficha, poder);
}

// Decisão ÚNICA do acesso (aceitar ensinamento/cópia, importar, Sexta-Feira, modelo, salvar):
//  permitido: pode gravar agora; precisaConfirmarExcecao: só o Mestre, depois de confirmar "Raça sem acesso: conceder como exceção?" (gravar com racaExcecao: true).
//  Poder que não é Habilidade de Raça, que já tem exceção (racaExcecao === true) ou com acesso: permitido.
export function verificarAcessoHabilidadeRaca({ cenario, ficha, poder, isMestre } = {}) {
    if (!ehHabilidadeDeRaca(poder) || poder.racaExcecao === true || racaTemAcesso(cenario, ficha, poder)) {
        return { permitido: true, precisaConfirmarExcecao: false, mensagem: '' };
    }
    const motivo = motivoSemAcesso(cenario, ficha, poder);
    if (isMestre === true) {
        return { permitido: false, precisaConfirmarExcecao: true, mensagem: `${motivo}\n\nRaça sem acesso: conceder como exceção?` };
    }
    return { permitido: false, precisaConfirmarExcecao: false, mensagem: `${motivo} Só o Mestre pode conceder como exceção.` };
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
export function limparReferenciasDeRaca(idRaca, { racas = [], poderes = [] } = {}) {
    let alterados = 0;
    const novasRacas = sanitizarRacas(racas).filter(r => r.id !== idRaca).map((r) => {
        if (r.herdaDe === idRaca) { alterados += 1; return { ...r, herdaDe: '' }; }
        return r;
    });
    const novosPoderes = comoLista(poderes).map((p) => {
        if (p && Array.isArray(p.racasAcesso) && p.racasAcesso.includes(idRaca)) {
            alterados += 1;
            return { ...p, racasAcesso: p.racasAcesso.filter(i => i !== idRaca) };
        }
        return p;
    });
    return { racas: novasRacas, poderes: novosPoderes, alterados };
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
