// ==========================================
// 💾 ATAQUES SALVOS (configuração, não texto)
//
// O ataque salvo guarda COMO o ataque foi montado (atributos da arma, energia/% da arma, e para cada
// Habilidade/Magia ativa: atributos usados, energia, "Conjurar como Poder" e %), e NÃO um número ou uma
// fórmula escrita. Ao executar, o dano é recalculado pela engine com as regras de hoje (calcularDano:
// dano sem multiplicadores, Custo virando Poder do golpe, limite de dados etc.), então nunca fica
// preso aos valores inflados de quando foi salvo.
//
// As fórmulas de texto antigas (ficha.ataqueConfig.formulasSalvas, do Modo Deus) carregam multiplicadores
// digitados à mão: as salvas antes desta versão são marcadas como desatualizadas na tela.
// ==========================================

export const VERSAO_ATAQUE_SALVO = 2;

const copiarLista = (v, padrao) => (Array.isArray(v) && v.length > 0 ? [...v] : padrao);

// Monta o registro a salvar. Só guarda as habilidades/magias que estão ativas agora.
export function montarAtaqueSalvo({ nome, armaStatusUsados, armaEnergiaCombustao, armaPercEnergia, poderesAtivos, magiasOfensivas, skillConfigs, agora = Date.now() }) {
    const cfgs = skillConfigs || {};
    const poderesIds = (poderesAtivos || []).map(p => p.id);
    const magiasIds = (magiasOfensivas || []).map(m => m.id);
    const configHabilidades = {};
    [...poderesIds, ...magiasIds].forEach(id => {
        const c = cfgs[id] || {};
        configHabilidades[id] = {
            statusUsados: copiarLista(c.statusUsados, ['forca']),
            energiaCombustao: c.energiaCombustao || 'mana',
            comoPoder: !!c.comoPoder,
            percComoPoder: c.percComoPoder
        };
    });
    return {
        id: agora,
        nome: String(nome || '').trim(),
        versao: VERSAO_ATAQUE_SALVO,
        config: {
            armaStatusUsados: copiarLista(armaStatusUsados, ['forca']),
            armaEnergiaCombustao: armaEnergiaCombustao || 'mana',
            armaPercEnergia: parseFloat(armaPercEnergia) || 0,
            poderesIds, magiasIds, skillConfigs: configHabilidades
        }
    };
}

// Cruza o ataque salvo com o que existe/está ativo agora: só roda o que ainda está disponível.
export function resolverAtaqueSalvo(salvo, { poderesAtivos, magiasOfensivas }) {
    const cfg = salvo?.config;
    if (!cfg) return null;
    const idsP = new Set(cfg.poderesIds || []);
    const idsM = new Set(cfg.magiasIds || []);
    const poderes = (poderesAtivos || []).filter(p => idsP.has(p.id));
    const magias = (magiasOfensivas || []).filter(m => idsM.has(m.id));
    const faltando = (cfg.poderesIds || []).length - poderes.length + (cfg.magiasIds || []).length - magias.length;
    return {
        poderes, magias, faltando,
        armaStatusUsados: copiarLista(cfg.armaStatusUsados, ['forca']),
        armaEnergiaCombustao: cfg.armaEnergiaCombustao || 'mana',
        armaPercEnergia: parseFloat(cfg.armaPercEnergia) || 0,
        skillConfigs: cfg.skillConfigs || {}
    };
}

// Fórmula de texto do Modo Deus salva antes desta versão (sem `versao`): números antigos dentro do texto.
export function formulaDesatualizada(formula) {
    return !!formula && !formula.versao;
}

const ROTULO_STATUS = { forca: 'Força', destreza: 'Destreza', inteligencia: 'Inteligência', sabedoria: 'Sabedoria', energiaEsp: 'Energia Esp.', carisma: 'Carisma', stamina: 'Stamina', constituicao: 'Constituição' };

// Resumo legível de um ataque salvo para a tela do Mapa (só leitura): o que ele usa e o que não está mais ativo.
// `ficha` dá os nomes (poderes/ataquesElementais por id); poderesAtivos/magiasOfensivas dizem o que está ativo agora.
export function descreverAtaqueSalvo(salvo, { ficha, poderesAtivos, magiasOfensivas, armaEquipada } = {}) {
    const cfg = salvo?.config;
    if (!cfg) return null;
    const ativosP = new Set((poderesAtivos || []).map(p => p.id));
    const ativosM = new Set((magiasOfensivas || []).map(m => m.id));
    const cfgs = cfg.skillConfigs || {};
    const nomeDe = (lista, id) => ((lista || []).find(x => x && x.id === id) || {}).nome || 'Habilidade removida';
    const montar = (ids, lista, ativos, tipo) => (ids || []).map(id => ({
        id, tipo,
        nome: nomeDe(lista, id),
        ativo: ativos.has(id),
        comoPoder: !!(cfgs[id] && cfgs[id].comoPoder)
    }));
    const itens = [...montar(cfg.poderesIds, ficha?.poderes, ativosP, 'habilidade'), ...montar(cfg.magiasIds, ficha?.ataquesElementais, ativosM, 'tecnica')];
    const status = (cfg.armaStatusUsados || []).map(s => ROTULO_STATUS[s] || s);
    return {
        arma: armaEquipada ? { nome: armaEquipada.nome, atributos: status } : null,
        itens,
        faltando: itens.filter(i => !i.ativo).length
    };
}
