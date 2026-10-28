// ==========================================
// 🗺️ CENAS POR REGIÃO DO MAPA (Terra 0 e, no futuro, os outros planetas)
// Fonte única da verdade: `cenario.lista` (Firebase, a mesma lista do Gerenciador de Cenas). Cada Cena guarda:
//   reino        — região do mapa a que pertence (ex: 'Noxus'); sem isso, vale o prefixo "[Noxus] " do nome (Cenas antigas)
//   restrita     — true: só entra quem estiver em `acessoNomes` (o Mestre/Co-Mestre sempre entra); ausente: todos entram
//   acessoNomes  — nomes (sanitizados) dos personagens liberados quando `restrita`
//   apenasCriador— já existente: só o Mestre Supremo enxerga
//   ponto        — ponto de interesse da região onde a Cena fica (ver core/pontosInteresse.js); ausente: "sem ponto"
// Só Mestre/Co-Mestre cria Cenas; esta lógica é pura e serve de base pra tela do Mapa e pro Gerenciador.
// ==========================================

const PREFIXO_REGIAO = /^\[([^\]]+)\]\s*/;

export function nomeSeguro(n) {
    return !n ? '' : String(n).replace(/[.#$[\]/]/g, '_').trim();
}

// Região da Cena: o campo `reino` ou, nas Cenas criadas antes dele existir, o "[Região] " do começo do nome.
export function regiaoDaCena(cena) {
    if (!cena || typeof cena !== 'object') return '';
    if (cena.reino) return String(cena.reino);
    const achou = PREFIXO_REGIAO.exec(String(cena.nome || ''));
    return achou ? achou[1] : '';
}

// Nome para exibir dentro da região (sem repetir o "[Região]" que já está no título da tela).
export function nomeDaCenaNaRegiao(cena) {
    const nome = String(cena?.nome || '');
    return regiaoDaCena(cena) ? nome.replace(PREFIXO_REGIAO, '') || nome : nome;
}

export function listaDeNomesComAcesso(cena) {
    return Array.isArray(cena?.acessoNomes) ? cena.acessoNomes.map(nomeSeguro).filter(Boolean) : [];
}

// Quem pode abrir a Cena. `ehMestre` inclui Co-Mestre. A Cena publicada pra mesa toda (`ativaId`) é de todos.
export function podeAcessarCena(cena, id, { ehMestre = false, souCriador = false, meuNome = '', ativaId = null } = {}) {
    if (!cena || typeof cena !== 'object') return false;
    if (cena.apenasCriador && !souCriador && ativaId !== id) return false;
    if (ehMestre) return true;
    if (ativaId === id) return true;
    if (!cena.restrita) return true;
    const eu = nomeSeguro(meuNome);
    return !!eu && listaDeNomesComAcesso(cena).includes(eu);
}

// Cenas de uma região que esta pessoa pode ver, em ordem alfabética: [{ id, cena }].
export function cenasDaRegiao(lista, reino, contexto = {}) {
    if (!lista || typeof lista !== 'object' || !reino) return [];
    return Object.entries(lista)
        .filter(([id, cena]) => regiaoDaCena(cena) === reino && podeAcessarCena(cena, id, contexto))
        .map(([id, cena]) => ({ id, cena }))
        .sort((a, b) => nomeDaCenaNaRegiao(a.cena).localeCompare(nomeDaCenaNaRegiao(b.cena), 'pt-BR'));
}

export function novaCenaDeRegiao({ reino, nome, img = '', criadoPor = '', ponto = '' }) {
    return {
        nome: String(nome || '').trim(), img, escala: 1.5, unidade: 'm', reino,
        ...(ponto ? { ponto } : {}),
        ...(criadoPor ? { criadoPor } : {})
    };
}

// Devolve um cenário NOVO com a Cena criada na região (o original não é alterado), pronto pra salvarCenarioCompleto.
export function cenarioComCenaDeRegiao(cenario, id, dados) {
    return { ...(cenario || {}), lista: { ...(cenario?.lista || {}), [id]: novaCenaDeRegiao(dados) } };
}

// Define quem entra na Cena: `nomes` = null → todos; lista (mesmo vazia) → só esses personagens (e o Mestre).
export function cenarioComAcessoDaCena(cenario, id, nomes) {
    const cena = cenario?.lista?.[id];
    if (!cena) return cenario;
    const { restrita, acessoNomes, ...resto } = cena;
    const nova = Array.isArray(nomes)
        ? { ...resto, restrita: true, ...(nomes.length ? { acessoNomes: [...new Set(nomes.map(nomeSeguro).filter(Boolean))] } : {}) }
        : resto;
    return { ...cenario, lista: { ...cenario.lista, [id]: nova } };
}

// Mapas que o Mestre criou nas versões antigas ficavam só no navegador dele (localStorage `rpg_atlas_mundi`,
// { [região]: [{ id, nome, img }] }). Devolve o que ainda não existe no cenário compartilhado, pra subir pro Firebase.
export function cenasPendentesDoAtlasLocal(atlas, lista) {
    const pendentes = [];
    if (!atlas || typeof atlas !== 'object') return pendentes;
    for (const [reino, mapas] of Object.entries(atlas)) {
        if (!Array.isArray(mapas)) continue;
        for (const m of mapas) {
            if (!m || !m.id || !m.nome || lista?.[m.id]) continue;
            pendentes.push({ id: m.id, reino, nome: m.nome, img: m.img || '' });
        }
    }
    return pendentes;
}
