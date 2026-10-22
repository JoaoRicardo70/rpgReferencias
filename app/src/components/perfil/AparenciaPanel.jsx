import React, { useState, useCallback } from 'react';
import { TEMAS_APP, lerTemaSalvo, aplicarTemaNoBody, salvarTema } from '../../core/temasApp';
import { NIVEIS_ROLAGEM } from '../../core/rolagemDado';
import { NIVEIS_COLORIVEIS, coresPadraoDoDado, lerCoresDado, salvarCoresDado, clarearCor } from '../../core/coresDado';

const ROTULOS_DADO = { normal: 'Comum', critico: 'Crítico', fatal: 'Crítico Fatal', falha: 'Falha Crítica' };

// 🎨 Aparência: estilo visual do app (Medieval, Moderno, Futurista, Mescla e os clássicos) e as cores do dado.
// Preferências só deste aparelho: cada jogador escolhe o que prefere sem mudar a tela dos outros.
export default function AparenciaPanel() {
    const [tema, setTema] = useState(() => lerTemaSalvo());
    const [coresDado, setCoresDado] = useState(() => lerCoresDado());

    const escolherTema = useCallback((id) => {
        setTema(id);
        aplicarTemaNoBody(id);
        salvarTema(id);
    }, []);

    const mudarCorDado = useCallback((nivel, cor) => {
        setCoresDado(salvarCoresDado({ ...coresDado, [nivel]: cor }));
    }, [coresDado]);

    const restaurarCoresDado = useCallback(() => {
        setCoresDado(salvarCoresDado(coresPadraoDoDado()));
    }, []);

    const grupo = (id, titulo) => (
        <>
            <div className="aparencia-subtitulo">{titulo}</div>
            <div className="aparencia-temas">
                {TEMAS_APP.filter(t => t.grupo === id).map(t => (
                    <button key={t.id} type="button" className={`aparencia-tema${tema === t.id ? ' ativo' : ''}`} aria-pressed={tema === t.id} onClick={() => escolherTema(t.id)}>
                        <span className="aparencia-tema-emoji">{t.emoji}</span>
                        <span className="aparencia-tema-nome">{t.nome}</span>
                        <span className="aparencia-tema-desc">{t.descricao}</span>
                    </button>
                ))}
            </div>
        </>
    );

    return (
        <div className="def-box aparencia-panel">
            <h3 className="aparencia-titulo">🎨 Aparência</h3>
            <p className="aparencia-nota">Vale só para este aparelho: cada jogador escolhe o visual que prefere.</p>

            {grupo('estilo', 'Estilo visual')}
            {grupo('classico', 'Temas clássicos')}

            <div className="aparencia-subtitulo">🎲 Cores do dado</div>
            <div className="aparencia-dado">
                {NIVEIS_COLORIVEIS.map(n => (
                    <label key={n} className="aparencia-dado-item">
                        <input type="color" value={coresDado[n]} onChange={e => mudarCorDado(n, e.target.value)} aria-label={`Cor do dado: ${ROTULOS_DADO[n]}`} />
                        <span className="aparencia-dado-amostra" style={{ '--cor-amostra': coresDado[n], '--cor-amostra-texto': clarearCor(coresDado[n], 0.4) }}>{NIVEIS_ROLAGEM[n].icone} {ROTULOS_DADO[n]}</span>
                    </label>
                ))}
                <button type="button" className="btn-neon aparencia-dado-restaurar" onClick={restaurarCoresDado}>Restaurar cores</button>
            </div>
        </div>
    );
}
