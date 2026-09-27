import React, { useCallback } from 'react';
import useStore from '../../stores/useStore';

// ⏭️ CONTROLE DE TURNO NA ABA MESTRE: mostra a ordem de iniciativa da cena exibida no Mapa e passa
// o turno sem trocar de aba. Não tem lógica própria de turno — chama a MESMA função avancarTurno
// do Mapa (registrada na store pelo MapaFormProvider, ver resumoTurnoMapa/acaoAvancarTurnoMapa em
// useStore.js), então Ações, Fadiga, Regeneração e Zonas continuam sendo aplicadas exatamente
// como no botão "Passar Turno" do Mapa.
export default function MestreControleTurno() {
    const resumo = useStore(s => s.resumoTurnoMapa);
    const acaoAvancarTurno = useStore(s => s.acaoAvancarTurnoMapa);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);

    const ordem = resumo?.ordem || [];
    const emCombate = ordem.length > 0;
    const indiceAtual = emCombate ? (Number(resumo?.turnoAtualIndex) || 0) % ordem.length : 0;
    const daVez = emCombate ? ordem[indiceAtual] : null;
    const proximo = emCombate ? ordem[(indiceAtual + 1) % ordem.length] : null;

    const passarTurno = useCallback(() => {
        if (typeof acaoAvancarTurno === 'function') acaoAvancarTurno();
    }, [acaoAvancarTurno]);

    const irParaMapa = useCallback(() => setAbaAtiva('aba-mapa'), [setAbaAtiva]);

    return (
        <div className="mestre-turno">
            <div className="mestre-turno-topo">
                <h3 className="mestre-turno-titulo">⏭️ Controle de Turnos</h3>
                <button
                    className="btn-neon mestre-turno-btn-passar"
                    onClick={passarTurno}
                    disabled={!emCombate || typeof acaoAvancarTurno !== 'function'}
                    title="Passa o turno exatamente como o botão do Mapa (reseta Ações, aplica Fadiga e Regeneração do próximo)"
                >
                    PASSAR TURNO ⏭️
                </button>
            </div>

            {!emCombate ? (
                <p className="mestre-turno-vazio">
                    Nenhum combate na cena exibida do Mapa. Defina as iniciativas no{' '}
                    <button className="mestre-turno-link" onClick={irParaMapa}>Mapa</button>{' '}
                    para começar.
                </p>
            ) : (
                <>
                    <div className="mestre-turno-status">
                        <span>Vez de: <strong className="mestre-turno-davez">{daVez?.nome}</strong></span>
                        <span className="mestre-turno-proximo">Próximo: {proximo?.nome}</span>
                    </div>
                    <div className="mestre-turno-ordem">
                        {ordem.map((e, i) => (
                            <span
                                key={`${e.isDummie ? 'd' : 'p'}-${e.id}`}
                                className={`mestre-turno-chip${i === indiceAtual ? ' ativo' : ''}${e.isDummie ? ' dummie' : ''}`}
                                title={`Iniciativa ${e.iniciativa}`}
                            >
                                {e.isDummie ? '👾 ' : ''}{e.nome} <small>({e.iniciativa})</small>
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
