// ==========================================
// ↩️ REFLEXO — Poderes, Habilidades e Técnicas capazes de devolver o ataque que receberiam. Caso raro e específico.
//   reflexo: { modo, mult, automatico, custoPercentual, energia, gastaReacao, descricao }
//   Modos:  devolver     — o defensor não sofre; o atacante recebe o Dano que chegaria (x mult%).
//           compartilhar — o defensor sofre normalmente E o atacante recebe o mesmo Dano (x mult%).
//           contra       — contra-golpe: o defensor não sofre; o atacante recebe o Dano ORIGINAL do golpe x mult% (padrão 150%).
// Vale só enquanto o Poder estiver Ativo / a Técnica Equipada. `automatico`: dispara sozinho quando o atacante aplica o
// Dano direto em quem tem o reflexo; sem ele o defensor escolhe usar na hora de receber o Dano (aba Defesa).
// ==========================================

export const MODOS_REFLEXO = [
    { id: 'devolver', nome: 'Devolver o Dano', dica: 'Você não sofre e o atacante recebe o Dano.' },
    { id: 'compartilhar', nome: 'Compartilhar o Dano', dica: 'Você sofre e o atacante também recebe o Dano.' },
    { id: 'contra', nome: 'Contra-golpe', dica: 'Você não sofre e o atacante recebe o golpe original com bônus.' }
];
const MODOS = MODOS_REFLEXO.map(m => m.id);
export const ENERGIAS_REFLEXO = ['mana', 'aura', 'chakra'];

export function normalizarReflexo(r) {
    if (!r || typeof r !== 'object' || !MODOS.includes(r.modo)) return null;
    const padrao = r.modo === 'contra' ? 150 : 100;
    const mult = Math.max(10, Math.min(1000, Math.floor(Number(r.mult)) || padrao));
    const custo = Math.max(0, Math.min(100, Number(r.custoPercentual) || 0));
    return {
        modo: r.modo, mult, automatico: !!r.automatico, gastaReacao: !!r.gastaReacao,
        custoPercentual: custo, energia: ENERGIAS_REFLEXO.includes(r.energia) ? r.energia : 'mana',
        descricao: String(r.descricao || '').slice(0, 200)
    };
}

// Reflexos que a ficha pode usar agora: Poder/Habilidade Ativo ou Técnica Equipada com `reflexo` configurado.
export function reflexosDisponiveis(ficha) {
    const lista = [];
    ((ficha && ficha.poderes) || []).forEach((p) => { const r = p && p.ativa ? normalizarReflexo(p.reflexo) : null; if (r) lista.push({ origem: 'poder', id: p.id, nome: p.nome || 'Poder', reflexo: r }); });
    ((ficha && ficha.ataquesElementais) || []).forEach((m) => { const r = m && m.equipado ? normalizarReflexo(m.reflexo) : null; if (r) lista.push({ origem: 'tecnica', id: m.id, nome: m.nome || 'Técnica', reflexo: r }); });
    return lista;
}

// danoChega = Dano que chegaria ao defensor (já com as defesas dele); danoOriginal = Dano do golpe antes disso.
export function calcularReflexo(reflexo, { danoChega, danoOriginal }) {
    const r = normalizarReflexo(reflexo);
    const chega = Math.max(0, Math.floor(Number(danoChega) || 0));
    const original = Math.max(0, Math.floor(Number(danoOriginal) || 0));
    if (!r) return { danoNoDefensor: chega, danoNoAtacante: 0 };
    const f = r.mult / 100;
    if (r.modo === 'compartilhar') return { danoNoDefensor: chega, danoNoAtacante: Math.floor(chega * f) };
    if (r.modo === 'contra') return { danoNoDefensor: 0, danoNoAtacante: Math.floor(original * f) };
    return { danoNoDefensor: 0, danoNoAtacante: Math.floor(chega * f) };
}

export function descreverReflexo(item, calculo, nomeAtacante = 'o atacante') {
    const modo = (MODOS_REFLEXO.find(m => m.id === item.reflexo.modo) || {}).nome || 'Reflexo';
    const lado = calculo.danoNoDefensor > 0 ? `o defensor sofreu ${calculo.danoNoDefensor.toLocaleString('pt-BR')}` : 'o defensor não sofreu nada';
    return `↩️ ${item.nome} (${modo}, ${item.reflexo.mult}%): ${nomeAtacante} recebeu ${calculo.danoNoAtacante.toLocaleString('pt-BR')} e ${lado}.`;
}
