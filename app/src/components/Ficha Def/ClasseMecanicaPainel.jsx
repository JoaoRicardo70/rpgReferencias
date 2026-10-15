import React, { useCallback, useMemo } from 'react';
import { getTextoMecanica, getClasseAtivaId, getNivelClasse, normalizarTexto, racaDeDragao, ehBerserker, calcularFatorBerserker } from '../../core/classesMecanicas';
import { getDadosClasseRegistrada } from '../../core/attributes';
import { getVidaTotalMaxDisplay } from '../../core/vitals';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// 🛡️ Painel da Classe na Ficha Definitiva (ao lado da foto): o resumo do que a Classe faz em combate
// (core/classesMecanicas.js) e os controles que o jogador marca — Montaria (Rider), contato com o
// Vazio (Foreigner), arauto (Moon Cancer) e a troca de Classe do Alter Ego / Pretender, que em
// combate gasta uma Ação Bônus. `salvar(caminho, valor)` é o salvar da própria Ficha Definitiva.
export default function ClasseMecanicaPainel({ ficha, salvar, meuNome, opcoesClasses }) {
    // Assina a mesa só pra re-renderizar quando o Mestre troca o Grand/Candidato (nível vem do Compêndio).
    useStore(s => s.personagens);
    const classeAtiva = getClasseAtivaId(ficha);
    const classeBio = normalizarTexto(ficha?.bio?.classe);
    const subClasse = normalizarTexto(ficha?.bio?.subClasse);
    const combate = (ficha && ficha.combate) || {};
    const emCombate = (parseInt(ficha?.iniciativa) || 0) > 0;

    const rotuloClasse = useCallback((id) => {
        const o = (opcoesClasses || []).find(c => c.id === id);
        return o ? `${o.icone ? `${o.icone} ` : ''}${o.nome}` : id;
    }, [opcoesClasses]);

    const memorizadas = useMemo(() => (Array.isArray(ficha?.bio?.classesMemorizadas) ? ficha.bio.classesMemorizadas : []), [ficha?.bio?.classesMemorizadas]);
    const slotFixo = normalizarTexto(ficha?.bio?.alterEgoSlot1);
    // Alter Ego: a classe própria e a de cada Ser Selado/Espírito/Pacto que tenha classe.
    const opcoesAlterEgo = useMemo(() => {
        const ids = [];
        if (slotFixo) ids.push(slotFixo);
        (ficha?.seresSelados || []).forEach(s => { const c = normalizarTexto(s && s.classe); if (c && !ids.includes(c)) ids.push(c); });
        return ids;
    }, [slotFixo, ficha?.seresSelados]);

    const alternar = useCallback((campo) => { salvar(`combate.${campo}`, !combate[campo]); }, [salvar, combate]);

    // Trocar a Classe vestida em combate gasta uma Ação Bônus (fora dele é livre).
    const trocarClasse = useCallback((nova) => {
        if (nova === subClasse) return;
        if (emCombate) {
            if (!window.confirm('Trocar de Classe em combate gasta uma Ação Bônus. Confirmar?')) return;
            enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto: `🎭 ${meuNome} gastou uma Ação Bônus para trocar de Classe.` });
        }
        salvar('bio.subClasse', nova);
    }, [subClasse, emCombate, meuNome, salvar]);

    // Trocar o fragmento fixo leva junto a classe vestida, se ela era o fragmento anterior.
    const trocarFragmentoFixo = useCallback((novo) => {
        salvar('bio.alterEgoSlot1', novo);
        if (slotFixo && subClasse === slotFixo) salvar('bio.subClasse', novo);
    }, [salvar, slotFixo, subClasse]);

    const memorizar = useCallback((id) => {
        if (!id || memorizadas.includes(id)) return;
        salvar('bio.classesMemorizadas', [...memorizadas, id]);
    }, [memorizadas, salvar]);

    const descansoLongo = useCallback(() => {
        if (!window.confirm('O Descanso Longo apaga todas as Classes memorizadas do Pretender e o Disfarce atual. Confirmar?')) return;
        salvar('bio.classesMemorizadas', []);
        salvar('bio.subClasse', '');
    }, [salvar]);

    // 🩸 Fúria do Berserker: Vida perdida agora x o máximo já atingido (que cura nenhuma tira).
    const berserker = ehBerserker(ficha);
    const percPerdido = (() => {
        if (!berserker) return 0;
        const maxVida = getVidaTotalMaxDisplay(ficha);
        const atual = ficha?.vida?.atual ?? maxVida;
        return Math.floor(maxVida > 0 ? Math.max(0, ((maxVida - atual) / maxVida) * 100) : 0);
    })();
    const furiaMax = Number(combate.furiaMax) || 0;
    const percFuria = Math.max(percPerdido, furiaMax);
    const acalmarFuria = useCallback(() => { salvar('combate.furiaMax', percPerdido); }, [salvar, percPerdido]);

    const nivel = getNivelClasse(ficha);
    const resumo = getTextoMecanica(classeAtiva, nivel) || getTextoMecanica(classeBio, nivel);
    if (!resumo) return null;
    const habilidadeGrand = nivel === 'grand' ? ((getDadosClasseRegistrada(classeAtiva) || {}).habilidadeGrand || '') : '';

    const ehTroca = classeBio === 'alterego' || classeBio === 'pretender';
    const dragao = racaDeDragao(ficha);
    const classesParaMemorizar = (opcoesClasses || []).filter(c => c.id && c.id !== 'pretender' && c.id !== 'alterego' && !memorizadas.includes(c.id));

    return (
        <div className="classe-mecanica">
            <h3 className="classe-mecanica-titulo">🛡️ Mecânica da Classe: {rotuloClasse(classeAtiva || classeBio)}</h3>
            {nivel !== 'comum' && (
                <div className={`classe-mecanica-nivel classe-mecanica-nivel-${nivel}`}>
                    {nivel === 'grand' ? `👑 GRAND ${rotuloClasse(classeAtiva || classeBio).toUpperCase()}` : '🌟 Candidato a Grand'}
                </div>
            )}
            <p className="classe-mecanica-texto">{resumo}</p>
            {habilidadeGrand && (
                <p className="classe-mecanica-grand"><strong>👑 Habilidade exclusiva do Grand:</strong> {habilidadeGrand}</p>
            )}

            {ehTroca && (
                <div className="classe-mecanica-troca">
                    {classeBio === 'alterego' && (
                        <>
                            <label className="classe-mecanica-rotulo" htmlFor="classe-slot-fixo">Fragmento fixo:</label>
                            <select id="classe-slot-fixo" className="input-neon" value={slotFixo} onChange={e => trocarFragmentoFixo(e.target.value)}>
                                <option value="">Nenhum</option>
                                {(opcoesClasses || []).filter(c => c.id && c.id !== 'alterego' && c.id !== 'pretender').map(c => <option key={c.id} value={c.id}>{rotuloClasse(c.id)}</option>)}
                            </select>
                            <label className="classe-mecanica-rotulo" htmlFor="classe-equipada">Classe equipada:</label>
                            <select id="classe-equipada" className="input-neon" value={subClasse} onChange={e => trocarClasse(e.target.value)}>
                                <option value="">Classe própria (Alter Ego)</option>
                                {opcoesAlterEgo.map(id => <option key={id} value={id}>{rotuloClasse(id)}</option>)}
                            </select>
                        </>
                    )}
                    {classeBio === 'pretender' && (
                        <>
                            <label className="classe-mecanica-rotulo" htmlFor="classe-memorizar">Memorizar Classe encontrada:</label>
                            <select id="classe-memorizar" className="input-neon" value="" onChange={e => memorizar(e.target.value)}>
                                <option value="">Escolher…</option>
                                {classesParaMemorizar.map(c => <option key={c.id} value={c.id}>{rotuloClasse(c.id)}</option>)}
                            </select>
                            <label className="classe-mecanica-rotulo" htmlFor="classe-equipada">Classe vestida:</label>
                            <select id="classe-equipada" className="input-neon" value={subClasse} onChange={e => trocarClasse(e.target.value)}>
                                <option value="">Nenhuma (Pretender)</option>
                                {memorizadas.map(id => <option key={id} value={id}>{rotuloClasse(id)}</option>)}
                            </select>
                            <button type="button" className="btn-neon btn-small btn-red classe-mecanica-descanso" onClick={descansoLongo}>🛌 Descanso Longo</button>
                        </>
                    )}
                    <p className="classe-mecanica-dica">Trocar em combate gasta uma Ação Bônus.</p>
                </div>
            )}

            {classeAtiva === 'rider' && (
                <label className="classe-mecanica-estado">
                    <input type="checkbox" checked={!!combate.montariaPresente || dragao} disabled={dragao} onChange={() => alternar('montariaPresente')} />
                    {dragao ? ' 🐉 Dragão: benefício da Montaria passivo' : ' 🏇 Montaria no campo de batalha'}
                </label>
            )}
            {classeAtiva === 'ruler' && (
                <label className="classe-mecanica-estado">
                    <input type="checkbox" checked={!!combate.focoProtecao} onChange={() => alternar('focoProtecao')} />
                    {' 🛡️ Em Foco de Proteção (só em combate, quando a circunstância permite)'}
                </label>
            )}
            {classeAtiva === 'avenger' && (
                <label className="classe-mecanica-estado">
                    <input type="checkbox" checked={!!combate.focoOdio} onChange={() => alternar('focoOdio')} />
                    {' 🔥 Em Foco de Ódio (só em combate, quando a circunstância permite)'}
                </label>
            )}
            {berserker && (
                <div className="classe-mecanica-furia">
                    <span>🩸 Vida perdida: <strong>{percPerdido}%</strong></span>
                    <span>Máximo atingido: <strong>{percFuria}%</strong> (x{Math.round(calcularFatorBerserker(percFuria, getNivelClasse(ficha)) * 100) / 100})</span>
                    <button type="button" className="btn-neon btn-small" onClick={acalmarFuria}>Acalmar Fúria</button>
                </div>
            )}
            {classeAtiva === 'foreigner' && (
                <p className="classe-mecanica-dica">🕳️ Foreigners são seres do Vazio (o Espaço): estão sempre em contato com ele, então o bônus está sempre ativo.</p>
            )}
            {classeAtiva === 'mooncancer' && (
                <div className="classe-mecanica-arauto">
                    <label className="classe-mecanica-rotulo" htmlFor="classe-arauto">🌕 Arauto de:</label>
                    <input id="classe-arauto" className="input-neon" type="text" placeholder="Ex.: Fogo, Lua, Tempo..." value={(ficha && ficha.bio && ficha.bio.arauto) || ''} onChange={e => salvar('bio.arauto', e.target.value)} />
                    <label className="classe-mecanica-estado">
                        <input type="checkbox" checked={!!combate.arautoAtivo} onChange={() => alternar('arautoAtivo')} />
                        {' Usando algo do que represento (vale pra qualquer golpe)'}
                    </label>
                    <p className="classe-mecanica-dica">Golpes cujo nome ou elemento contenham o arauto já contam sozinhos.</p>
                </div>
            )}
        </div>
    );
}
