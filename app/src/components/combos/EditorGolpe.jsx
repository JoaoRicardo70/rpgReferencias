import React, { useMemo, useCallback } from 'react';
import { TIPOS_GOLPE, ACOES_GOLPE, LIMITES } from '../../core/combos';
import EditorBuffs from './EditorBuffs';

// "acao" do golpe (padrao/bonus/reacao) a partir do tipo de Ação gasta que a técnica já tem ('acao' | 'bonus' | 'reacao').
const ACAO_DA_TECNICA = { acao: 'padrao', bonus: 'bonus', reacao: 'reacao' };

// Técnicas da ficha que dá para vincular a um golpe, conforme o tipo (ajuda a preencher nome e Ação; o golpe continua valendo sem vínculo).
function opcoesDeVinculo(ficha, tipo) {
    if (tipo === 'habilidade') return (ficha?.poderes || []).filter(p => p && p.nome).map(p => ({ id: String(p.id), nome: p.nome, tipoAcao: p.tipoAcao }));
    if (tipo === 'tecnica' || tipo === 'magia') return (ficha?.ataquesElementais || []).filter(t => t && t.nome).map(t => ({ id: String(t.id), nome: t.nome, tipoAcao: t.tipoAcao }));
    if (tipo === 'arma') return (ficha?.inventario || []).filter(i => i && i.tipo === 'arma' && i.nome).map(i => ({ id: String(i.id), nome: i.nome, tipoAcao: '' }));
    return [];
}

export default function EditorGolpe({ golpe, onChange, ficha, titulo, comBuffs = true }) {
    const vinculos = useMemo(() => opcoesDeVinculo(ficha, golpe.tipo), [ficha, golpe.tipo]);
    const mudar = useCallback((campos) => onChange({ ...golpe, ...campos }), [golpe, onChange]);

    const vincular = useCallback((id) => {
        const alvo = vinculos.find(v => v.id === id);
        if (!alvo) { mudar({ refId: '' }); return; }
        mudar({ refId: alvo.id, nome: golpe.nome || alvo.nome, acao: ACAO_DA_TECNICA[alvo.tipoAcao] || golpe.acao });
    }, [vinculos, golpe.nome, golpe.acao, mudar]);

    return (
        <div className="combo-golpe">
            {titulo && <span className="combo-rotulo">{titulo}</span>}
            <div className="combo-linha">
                <input className="input-neon" aria-label="Nome do golpe" placeholder="Nome do golpe" maxLength={LIMITES.nome} value={golpe.nome} onChange={(e) => mudar({ nome: e.target.value })} />
                <select className="input-neon" aria-label="Tipo do golpe" value={golpe.tipo} onChange={(e) => mudar({ tipo: e.target.value, refId: '' })}>
                    {TIPOS_GOLPE.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
                <select className="input-neon" aria-label="Ação gasta pelo golpe" value={golpe.acao} onChange={(e) => mudar({ acao: e.target.value })}>
                    {ACOES_GOLPE.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
                </select>
            </div>
            {vinculos.length > 0 && (
                <select className="input-neon" aria-label="Vincular a uma técnica da ficha" value={golpe.refId} onChange={(e) => vincular(e.target.value)}>
                    <option value="">Sem vínculo com a ficha</option>
                    {vinculos.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
            )}
            <input className="input-neon" aria-label="Descrição do golpe" placeholder="Descrição (opcional)" maxLength={LIMITES.descricao} value={golpe.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
            {comBuffs && <EditorBuffs buffs={golpe.buffs} onChange={(buffs) => mudar({ buffs })} rotulo="Buffs que este golpe dá (somam aos anteriores)" />}
        </div>
    );
}
