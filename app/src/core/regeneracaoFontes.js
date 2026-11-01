// ==========================================
// 💖 REGENERAÇÃO DETALHADA — de onde vem (e o que corta) a Regeneração por turno de cada vital.
// Função pura: percorre as mesmas fontes que getBuffs (core/attributes.js) e usa os mesmos helpers
// de aplicarRegeneracaoDeTurno (core/vitals.js), pra o total BATER com a cura real do turno.
// ==========================================
import { getBuffs, getEfeitosDeClasse } from './attributes.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { efeitosAtivosDoItem } from './efeitosItem.js';
import { getRegeneracaoManualPct, limitarRegeneracaoPct, REGENERACAO_PCT_MAX } from './regeneracao.js';
import { getTetoExibidoComFator, FATOR_EXIBICAO_VITAIS } from './vitals.js';
import { modificadoresDeEstados, stacksDe, nomeDoEstado } from './condicoes.js';
import { curaPassivaDoTurno } from './suporte.js';
import { calcularEficaciaCura } from './engine.js';

export const VITAIS_DETALHE_REGEN = ['vida', 'mana', 'aura', 'chakra', 'corpo'];
const ENERGIAS = ['mana', 'aura', 'chakra', 'corpo'];

const arred = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Mesma regra de `afeta` do getBuffs, só para a propriedade 'regeneracao'.
function efeitoAfetaVital(e, key) {
    const atr = String(e?.atributo || '').toLowerCase();
    return atr === key || atr === 'geral' || (atr === 'todas_energias' && ENERGIAS.includes(key));
}

// Percorre as fontes como o getBuffs e devolve [{ nome, origem, pct }] (inclui negativos, o filtro é de quem chama).
function coletarFontes(ficha, key) {
    const lista = [];
    const processar = (efeitos, nome, origem) => {
        if (!Array.isArray(efeitos)) return;
        efeitos.forEach((e) => {
            if (!e || String(e.propriedade || '').toLowerCase() !== 'regeneracao' || !efeitoAfetaVital(e, key)) return;
            const val = parseFloat(e.valor);
            lista.push({ nome: e.nome ? `${nome}: ${e.nome}` : nome, origem, pct: Number.isNaN(val) ? 0 : val });
        });
    };

    (ficha.poderes || []).forEach((p) => {
        if (!p) return;
        const r = resolverEfeitosEntidade(p);
        if (p.ativa) processar(r.efeitos, p.nome || 'Poder', 'Poder');
        processar(r.efeitosPassivos, p.nome || 'Poder', 'Poder (passivo)');
    });

    (ficha.inventario || []).forEach((item) => {
        if (!item || !item.equipado) return;
        const nome = item.nome || 'Item';
        const forma = item.formaAtivaId && item.formas ? item.formas.find(f => f.id === item.formaAtivaId) : null;
        if (!(forma && forma.acumulaFormaBase === false)) {
            processar(efeitosAtivosDoItem(item), nome, 'Item');
            processar(item.efeitosPassivos, nome, 'Item (passivo)');
        }
        if (forma) {
            const cfg = (item.configAtivaId && (forma.configs || []).find(c => c.id === item.configAtivaId)) || (forma.configs || [])[0] || null;
            const alvo = cfg || forma;
            const n = `${nome} · ${forma.nome || 'Forma'}${cfg && cfg.nome ? ` - ${cfg.nome}` : ''}`;
            processar(alvo.efeitos, n, 'Forma de item');
            processar(alvo.efeitosPassivos, n, 'Forma de item (passivo)');
        }
    });

    (ficha.seresSelados || []).forEach((ser) => {
        if (!ser || !ser.ativo) return;
        const nome = ser.nome || 'Ser selado';
        const r = resolverEfeitosEntidade(ser);
        processar(r.efeitos, nome, 'Pacto');
        processar(r.efeitosPassivos, nome, 'Pacto (passivo)');
        const forma = ser.formaAtivaId && ser.formas ? ser.formas.find(f => f.id === ser.formaAtivaId) : null;
        if (forma) {
            const cfg = (ser.configAtivaId && (forma.configs || []).find(c => c.id === ser.configAtivaId)) || (forma.configs || [])[0] || null;
            const alvo = cfg || forma;
            const n = `${nome} · ${forma.nome || 'Forma'}${cfg && cfg.nome ? ` - ${cfg.nome}` : ''}`;
            processar(alvo.efeitos, n, 'Forma de pacto');
            processar(alvo.efeitosPassivos, n, 'Forma de pacto (passivo)');
        }
    });

    (ficha.passivas || []).forEach((p) => { if (p) processar(p.efeitos, p.nome || 'Passiva', 'Passiva'); });

    let efeitosClasse = [];
    try { efeitosClasse = getEfeitosDeClasse(ficha) || []; } catch (e) { /* sem classe */ }
    efeitosClasse.forEach((e) => {
        processar([e], e && e.nome ? String(e.nome) : 'Classe / Combo / Buff', e && e.origem === 'combo' ? 'Combo' : 'Classe / Buff');
    });

    return lista;
}

export function detalharRegeneracaoVital(ficha, key) {
    const avisos = [];
    let teto = 0;
    try { teto = getTetoExibidoComFator(key, ficha); } catch (e) { /* ficha incompleta */ }
    const tetoExibido = Math.floor(teto / FATOR_EXIBICAO_VITAIS);
    const manualPct = getRegeneracaoManualPct(ficha?.[key], teto);

    let brutoBuff = 0;
    try { brutoBuff = getBuffs(ficha, key).regeneracao || 0; } catch (e) { /* sem buffs */ }

    // O getBuffs SOMA positivos e negativos; só o saldo dos bônus é piso 0 (os negativos reduzem os positivos).
    const todas = coletarFontes(ficha, key);
    const fontes = [];
    const cortes = [];
    todas.forEach((f) => {
        if (f.pct > 0) fontes.push({ ...f, pct: arred(f.pct) });
        else if (f.pct < 0) cortes.push({ ...f, pct: arred(f.pct) });
    });
    // Rede de segurança: se o getBuffs somar algo que a varredura não achou, mostra a diferença.
    const resto = brutoBuff - todas.reduce((s, f) => s + f.pct, 0);
    if (resto > 0.0001) fontes.push({ nome: "Outras fontes", origem: "Outros", pct: arred(resto) });
    else if (resto < -0.0001) cortes.push({ nome: "Outras fontes", origem: "Outros", pct: arred(resto) });
    if (brutoBuff < 0) avisos.push("Os bônus somam negativo: a Regeneração de fontes fica em 0%.");

    const pctBruto = manualPct + Math.max(0, brutoBuff);
    const pctTotal = limitarRegeneracaoPct(pctBruto);
    if (pctBruto > REGENERACAO_PCT_MAX) avisos.push(`Acima de ${REGENERACAO_PCT_MAX}% é limitado a ${REGENERACAO_PCT_MAX}%.`);

    let mult = 1;
    const estados = [];
    if (key === 'vida') {
        try {
            mult = modificadoresDeEstados(ficha).curaMult;
            ['sangrando', 'queimado', 'criogenia'].forEach((id) => {
                const n = stacksDe(ficha, id);
                if (n > 0) estados.push({ id, nome: nomeDoEstado(id), stacks: n, mult: Math.pow(0.5, n) });
            });
            if (mult < 1 && estados.reduce((m, e) => m * e.mult, 1) > mult) estados.push({ id: 'exaustao', nome: 'Exaustão 4+', stacks: 1, mult: 0.5 });
        } catch (e) { mult = 1; }
    }

    const pontosPorTurno = (teto * (pctTotal / 100) * mult) / FATOR_EXIBICAO_VITAIS;

    let curaPassiva = { total: 0, partes: [] };
    if (key === 'vida') {
        try {
            // Dados entram pela MÉDIA (o valor do turno é sorteado) e a Eficácia de Cura (estados, efetividade_cura) corta como na cura real do turno.
            const c = curaPassivaDoTurno(ficha, { vidaMaxExibida: tetoExibido, rolar: (faces) => (faces + 1) / 2 });
            const eficacia = calcularEficaciaCura(ficha);
            curaPassiva = { total: Math.floor((c.total || 0) * eficacia), partes: c.partes || [], estimativa: true, eficacia };
        } catch (e) { /* sem suporte passivo */ }
    }

    return {
        chave: key,
        tetoExibido,
        manualPct: arred(manualPct),
        fontes,
        cortes,
        pctBruto: arred(pctBruto),
        pctTotal: arred(pctTotal),
        corteEstados: key === 'vida' ? { mult, estados } : null,
        pontosPorTurno,
        curaPassiva,
        totalPontos: pontosPorTurno + curaPassiva.total,
        avisos
    };
}

export function detalharRegeneracao(ficha) {
    const out = {};
    VITAIS_DETALHE_REGEN.forEach((k) => { out[k] = detalharRegeneracaoVital(ficha || {}, k); });
    return out;
}
