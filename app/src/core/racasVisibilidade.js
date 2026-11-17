// ==========================================
// 🙈 VISIBILIDADE DAS RAÇAS — quem pode ver a(s) Raça(s) e o Domínio de um personagem (lógica pura, sem React/Firebase).
//
// MODELO
//  - ficha.bio.racaVisibilidade = { [racaId | '_principal']: 'publica' | 'privada' | 'secreta' }. Ausente/valor inválido = 'publica' (nada muda
//    para as fichas atuais). A chave '_principal' vale para a Raça principal escrita em texto livre (sem racaId no catálogo).
//  - publica: todos veem. privada ("só eu e o Mestre"): o dono e Mestre/Co-Mestre veem; os OUTROS jogadores não.
//    secreta ("só o Mestre"): só Mestre/Co-Mestre veem; o PRÓPRIO jogador vê "❓ Raça desconhecida" (às vezes o personagem não sabe qual é a sua Raça).
//  - Quem define: o jogador alterna as próprias Raças ENTRE publica e privada (nunca define nem desfaz 'secreta': se o nível é secreta ele nem vê a Raça);
//    Mestre/Co-Mestre definem qualquer nível de qualquer personagem. Modo Jogador do Mestre = visão de jogador (isMestre efetivo false).
//  - A MECÂNICA usa SEMPRE os dados reais (acesso, percentual, bloqueio, Zenkai...): só a EXIBIÇÃO muda.
//
// ⚠️ LIMITE HONESTO: as fichas sincronizam para TODOS os clientes (o Firebase não tem regras de leitura por campo). Ocultar é só de EXIBIÇÃO, no mesmo
// padrão do "lado oculto" (core/lados.js): um jogador que abra o banco/rede consegue ler bio.raca e bio.composicaoRacial. Não há criptografia.
//
// "viewer" = { souDono, souMestre } (ver contextoDoViewer).
// ==========================================
import {
    getRacas, getComposicaoRacial, resolverRaca, racasQueDaoAcesso, ehHabilidadeDeRaca, poderBloqueado, motivoSemAcesso,
} from './racas';

export const NIVEIS = Object.freeze(['publica', 'privada', 'secreta']);
export const NIVEL_PADRAO = 'publica';
export const CHAVE_PRINCIPAL = '_principal';
export const ROTULO_RACA_OCULTA = '❓ Raça desconhecida';
export const ROTULOS = Object.freeze({ publica: '🌐 Pública', privada: '🔒 Só eu e o Mestre', secreta: '🙈 Só o Mestre' });
export const DESCRICOES = Object.freeze({
    publica: 'Todos veem esta Raça.',
    privada: 'Só o dono e o Mestre veem esta Raça; os outros jogadores não.',
    secreta: 'Só o Mestre vê esta Raça; o próprio jogador vê "Raça desconhecida".',
});
export const MENSAGEM_SEM_ACESSO_GENERICA = 'Você ainda não tem acesso a esta habilidade.';
// Literal (e não SELO_BLOQUEADA): core/racas.js importa este módulo e o import é circular; nada aqui pode ler constantes de racas.js na carga.
export const SELO_BLOQUEADA_GENERICO = '🔒 Bloqueada';
export const AVISO_RACA_OCULTA_MESTRE = '🙈 Raça oculta para o jogador';

const RE_CHAVE = /^[a-z0-9_-]{1,40}$/;
const normalizarNome = (n) => (!n ? '' : String(n).replace(/[.#$[\]/]/g, '_').trim());

const mapaDe = (ficha) => {
    const m = ficha && ficha.bio && ficha.bio.racaVisibilidade;
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
};

export const nivelValido = (n) => NIVEIS.includes(n);

// Nível de uma Raça (id do catálogo ou CHAVE_PRINCIPAL). Ausente/inválido = 'publica'.
export function nivelDaRaca(ficha, racaId) {
    const v = typeof racaId === 'string' ? mapaDe(ficha)[racaId] : undefined;
    return nivelValido(v) ? v : NIVEL_PADRAO;
}

// Quem enxerga um nível? Mestre/Co-Mestre sempre; o dono só publica/privada; os outros só publica.
export function visivelPara({ nivel, souDono = false, souMestre = false } = {}) {
    if (souMestre) return true;
    if (nivel === 'secreta') return false;
    if (nivel === 'privada') return !!souDono;
    return true;
}

// { souDono, souMestre } de quem está olhando. `souDono` explícito (boolean) vence; senão compara nomeDono com meuNome (sanitizado).
export function contextoDoViewer({ nomeDono, meuNome, isMestre, souDono } = {}) {
    const dono = typeof souDono === 'boolean' ? souDono : (!!nomeDono && !!meuNome && normalizarNome(nomeDono) === normalizarNome(meuNome));
    return { souDono: dono, souMestre: isMestre === true };
}

export const VIEWER_MESTRE = Object.freeze({ souDono: false, souMestre: true });
export const VIEWER_OUTRO_JOGADOR = Object.freeze({ souDono: false, souMestre: false });
export const VIEWER_DONO_JOGADOR = Object.freeze({ souDono: true, souMestre: false });

const veRaca = (ficha, chave, viewer) => visivelPara({ nivel: nivelDaRaca(ficha, chave), souDono: !!(viewer && viewer.souDono), souMestre: !!(viewer && viewer.souMestre) });

// A Raça `racaId` está OCULTA para o viewer?
export const racaOcultaParaViewer = (cenario, ficha, racaId, viewer) => !veRaca(ficha, racaId, viewer);

// Composição racial só com as Raças que o viewer pode ver.
export function composicaoVisivel(cenario, ficha, viewer) {
    return getComposicaoRacial(cenario, ficha).filter(e => veRaca(ficha, e.racaId, viewer));
}

// Entradas da composição que o viewer NÃO vê. Só o dono (sem ser Mestre) as vê como "❓ Raça desconhecida" (sem percentual); outros: [] (nem sabem que existem).
export function racasDesconhecidasDoDono(cenario, ficha, viewer) {
    if (!viewer || !viewer.souDono || viewer.souMestre) return [];
    return getComposicaoRacial(cenario, ficha).filter(e => !veRaca(ficha, e.racaId, viewer));
}

// Raça principal para exibir: { texto, oculta, motivo: '' | 'privada' | 'secreta', id }. Sem Raça nenhuma: texto '' (nada a ocultar).
export function racaPrincipalVisivel(cenario, ficha, viewer) {
    const p = resolverRaca(cenario, ficha);
    if (!p.id && !p.nome) return { texto: '', oculta: false, motivo: '', id: '' };
    const nivel = nivelDaRaca(ficha, p.id || CHAVE_PRINCIPAL);
    if (veRaca(ficha, p.id || CHAVE_PRINCIPAL, viewer)) return { texto: p.nome, oculta: false, motivo: '', id: p.id };
    // O placeholder "❓ Raça desconhecida" é SÓ do dono (secreta): para terceiros nem a existência de uma Raça oculta aparece (texto vazio).
    const doDono = !!(viewer && viewer.souDono);
    return { texto: doDono ? ROTULO_RACA_OCULTA : '', oculta: true, motivo: nivel, id: '' };
}

// A habilidade revela uma Raça que o viewer não pode ver? (o acesso/Domínio dela passa por Raça oculta) ⇒ mascarar nome da Raça, Domínio e "Raças com acesso".
export function habilidadeRevelaRaca(cenario, ficha, poder, viewer) {
    if (!ehHabilidadeDeRaca(poder)) return false;
    const dao = racasQueDaoAcesso(cenario, ficha, poder, { ignorarPercentual: true });
    return dao.some(e => !veRaca(ficha, e.racaId, viewer));
}

// Só Mestre: a habilidade passa por uma Raça que o PRÓPRIO jogador não vê (secreta)? ⇒ aviso discreto "🙈 Raça oculta para o jogador".
export const habilidadeComRacaOcultaDoJogador = (cenario, ficha, poder) => habilidadeRevelaRaca(cenario, ficha, poder, VIEWER_DONO_JOGADOR);

// Nomes (e apelidos) das Raças ocultas para o viewer, do mais longo para o mais curto.
export function nomesRacasOcultas(cenario, ficha, viewer) {
    const racas = getRacas(cenario);
    const nomes = new Set();
    const juntar = (raca) => { if (raca) { nomes.add(raca.nome); (raca.apelidos || []).forEach(a => nomes.add(a)); } };
    getComposicaoRacial(cenario, ficha).forEach((e) => { if (!veRaca(ficha, e.racaId, viewer)) juntar(racas.find(r => r.id === e.racaId)); });
    const p = resolverRaca(cenario, ficha);
    if ((p.id || p.nome) && !veRaca(ficha, p.id || CHAVE_PRINCIPAL, viewer)) {
        if (p.id) juntar(racas.find(r => r.id === p.id)); else nomes.add(p.nome);
    }
    return [...nomes].filter(Boolean).sort((a, b) => b.length - a.length);
}

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Troca, num texto livre (mensagem, tooltip), o nome de cada Raça oculta por "❓ Raça desconhecida". Sem Raça oculta, devolve o texto igual.
export function mascararTextoRaca(cenario, ficha, texto, viewer) {
    const t = String(texto == null ? '' : texto);
    const nomes = nomesRacasOcultas(cenario, ficha, viewer);
    if (!t || nomes.length === 0) return t;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${nomes.map(escaparRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    return t.replace(re, ROTULO_RACA_OCULTA);
}

// Motivo de não ter acesso, na versão que o viewer pode ler: genérica quando o acesso passa por Raça oculta.
export function motivoSemAcessoVisivel(cenario, ficha, poder, viewer) {
    const motivo = motivoSemAcesso(cenario, ficha, poder);
    if (!motivo) return '';
    // Genérico só quando a Raça que dá/impede o acesso está oculta ao viewer, ou quando o próprio texto citaria uma Raça oculta.
    if (habilidadeRevelaRaca(cenario, ficha, poder, viewer)) return MENSAGEM_SEM_ACESSO_GENERICA;
    return mascararTextoRaca(cenario, ficha, motivo, viewer) !== motivo ? MENSAGEM_SEM_ACESSO_GENERICA : motivo;
}

// poderBloqueado na versão que o viewer pode ler: bloqueio por Domínio de Raça oculta vira "🔒 Bloqueada" genérico (sem Raça, % ou mínimo).
export function poderBloqueadoVisivel(cenario, ficha, poder, viewer) {
    const b = poderBloqueado(cenario, ficha, poder);
    if (!b.bloqueado || b.origem !== 'percentual' || !habilidadeRevelaRaca(cenario, ficha, poder, viewer)) return b;
    return { bloqueado: true, motivo: 'Habilidade ainda bloqueada.', requisito: '', origem: 'percentual', selo: SELO_BLOQUEADA_GENERICO };
}

// Bloqueio na versão que o DONO (ou o Mestre) pode ler: usar só para o TEXTO de avisos/alert/title; a decisão de bloquear continua em poderBloqueado.
export const poderBloqueadoParaDono = (cenario, ficha, poder, isMestre) => poderBloqueadoVisivel(cenario, ficha, poder, { souDono: true, souMestre: isMestre === true });

// A ficha tem alguma Raça que NÃO seja pública? (para marcar no painel do Mestre e para textos conservadores)
export const chavesNaoPublicas = (ficha) => Object.keys(mapaDe(ficha)).filter(k => nivelDaRaca(ficha, k) !== NIVEL_PADRAO);
export const fichaTemRacaOculta = (ficha) => chavesNaoPublicas(ficha).length > 0;

// Mapa limpo para gravar: só chaves válidas (slug de Raça ou '_principal') com nível válido E diferente de 'publica' (que é o padrão).
export function sanitizarVisibilidade(mapa) {
    const saida = {};
    if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return saida;
    Object.keys(mapa).forEach((k) => {
        if (!RE_CHAVE.test(k)) return;
        const v = mapa[k];
        if (nivelValido(v) && v !== NIVEL_PADRAO) saida[k] = v;
    });
    return saida;
}

// O jogador pode trocar `atual` por `novo` na própria Raça? Só publica⇄privada; nunca mexe em 'secreta' (nem para tirar, nem para pôr).
export function nivelPermitidoAoJogador(atual, novo) {
    const a = nivelValido(atual) ? atual : NIVEL_PADRAO;
    if (a === 'secreta') return false;
    return novo === 'publica' || novo === 'privada';
}

// Níveis que o seletor oferece a quem edita.
export const niveisParaEditor = (souMestre) => (souMestre ? NIVEIS : ['publica', 'privada']);
