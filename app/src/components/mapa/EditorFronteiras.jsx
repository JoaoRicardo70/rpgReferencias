import React, { useCallback, useRef, useState } from 'react';
import {
    GRADE_L, GRADE_A, MAX_FACCOES, NOME_MAX, RAIO_MIN, RAIO_MAX, celulaDoPonto, pintarCirculo, pintarTraco, apagarFaccaoDaGrade,
    novaFaccao, corValida, gradeIgual, gradeVazia, contarCelulas
} from '../../core/fronteiras';

const DESFAZER_MAX = 20;

// Painel do Mestre para "ajustar fronteiras": escolhe a facção, pinta ou apaga territórios arrastando sobre o mapa.
// O pai guarda o estado ({ facoes, grade }) e salva (com debounce); aqui só se calcula a mudança.
export default function EditorFronteiras({ facoes, grade, onMudar, onFechar }) {
    const [ativaId, setAtivaId] = useState(facoes[0]?.id || null);
    const [modo, setModo] = useState('pintar');
    const [raio, setRaio] = useState(4);
    const [pincel, setPincel] = useState(null);
    const historico = useRef([]);
    const arrastando = useRef(null);
    const superficie = useRef(null);
    const gradeAtual = useRef(grade);
    gradeAtual.current = grade;

    const idAtivo = facoes.some((f) => f.id === ativaId) ? ativaId : (facoes[0]?.id || null);
    const podePintar = modo === 'apagar' || !!idAtivo;

    const celulaDoEvento = useCallback((e) => {
        const r = superficie.current.getBoundingClientRect();
        return celulaDoPonto(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    }, []);

    const aplicar = useCallback((de, ate) => {
        const id = modo === 'apagar' ? '0' : idAtivo;
        if (id === null) return;
        const nova = de ? pintarTraco(gradeAtual.current, de, ate, raio, id) : pintarCirculo(gradeAtual.current, ate.cx, ate.cy, raio, id);
        if (nova !== gradeAtual.current) { gradeAtual.current = nova; onMudar({ facoes, grade: nova }); }
    }, [modo, idAtivo, raio, facoes, onMudar]);

    const aoPressionar = (e) => {
        if (!podePintar || e.button > 0) return;
        e.preventDefault();
        superficie.current.setPointerCapture?.(e.pointerId);
        historico.current = [...historico.current.slice(-(DESFAZER_MAX - 1)), gradeAtual.current];
        const c = celulaDoEvento(e);
        arrastando.current = c;
        aplicar(null, c);
    };
    const aoMover = (e) => {
        const c = celulaDoEvento(e);
        setPincel({ cx: c.cx, cy: c.cy });
        if (!arrastando.current) return;
        aplicar(arrastando.current, c);
        arrastando.current = c;
    };
    const aoSoltar = () => {
        if (!arrastando.current) return;
        arrastando.current = null;
        // pincelada que não mudou nada não entra no histórico de desfazer
        if (historico.current.length && gradeIgual(historico.current[historico.current.length - 1], gradeAtual.current)) historico.current.pop();
    };

    const desfazer = () => {
        const anterior = historico.current.pop();
        if (!anterior) return;
        gradeAtual.current = anterior;
        onMudar({ facoes, grade: anterior });
    };

    const mudarFaccao = (id, campo, valor) => {
        if (campo === 'cor' && !corValida(valor)) return;
        onMudar({ facoes: facoes.map((f) => (f.id === id ? { ...f, [campo]: campo === 'nome' ? String(valor).slice(0, NOME_MAX) : valor } : f)), grade: gradeAtual.current });
    };
    const adicionar = () => {
        const f = novaFaccao(facoes);
        if (!f) return;
        setAtivaId(f.id); setModo('pintar');
        onMudar({ facoes: [...facoes, f], grade: gradeAtual.current });
    };
    const remover = (f) => {
        if (!window.confirm(`Remover "${f.nome}" e todo o território dela?`)) return;
        historico.current = [];
        gradeAtual.current = apagarFaccaoDaGrade(gradeAtual.current, f.id);
        onMudar({ facoes: facoes.filter((x) => x.id !== f.id), grade: gradeAtual.current });
    };
    const limparTudo = () => {
        if (!window.confirm('Apagar todos os territórios pintados? As facções continuam na lista.')) return;
        historico.current = [...historico.current.slice(-(DESFAZER_MAX - 1)), gradeAtual.current];
        gradeAtual.current = gradeVazia();
        onMudar({ facoes, grade: gradeAtual.current });
    };

    const celulas = contarCelulas(grade);
    const totalPintado = Object.values(celulas).reduce((a, b) => a + b, 0);

    return (
        <>
            <div
                ref={superficie}
                className={`fronteiras-superficie${podePintar ? '' : ' fronteiras-superficie-bloqueada'}`}
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onPointerLeave={() => { setPincel(null); }}
                data-testid="fronteiras-superficie"
            >
                {pincel && podePintar && (
                    <span
                        className={`fronteiras-pincel${modo === 'apagar' ? ' fronteiras-pincel-apagar' : ''}`}
                        style={{ left: `${((pincel.cx + 0.5) / GRADE_L) * 100}%`, top: `${((pincel.cy + 0.5) / GRADE_A) * 100}%`, width: `${((raio * 2 + 1) / GRADE_L) * 100}%`, height: `${((raio * 2 + 1) / GRADE_A) * 100}%`, borderColor: modo === 'apagar' ? '#ffffff' : (facoes.find((f) => f.id === idAtivo)?.cor || '#ffffff') }}
                    />
                )}
            </div>

            <aside className="fronteiras-painel" aria-label="Ajustar fronteiras">
                <header className="fronteiras-painel-topo">
                    <h3>⚔️ Ajustar fronteiras</h3>
                    <button type="button" className="fronteiras-fechar" onClick={onFechar} aria-label="Fechar o editor de fronteiras">✕</button>
                </header>

                <ul className="fronteiras-lista">
                    {facoes.map((f) => (
                        <li key={f.id} className={`fronteiras-faccao${f.id === idAtivo && modo === 'pintar' ? ' fronteiras-faccao-ativa' : ''}`}>
                            <input type="radio" name="fronteiras-faccao" checked={f.id === idAtivo} onChange={() => { setAtivaId(f.id); setModo('pintar'); }} aria-label={`Pintar com ${f.nome}`} />
                            <input type="color" value={f.cor} onChange={(e) => mudarFaccao(f.id, 'cor', e.target.value)} aria-label={`Cor de ${f.nome}`} className="fronteiras-cor" />
                            <input type="text" value={f.nome} maxLength={NOME_MAX} onChange={(e) => mudarFaccao(f.id, 'nome', e.target.value)} aria-label={`Nome da facção ${f.id}`} className="input-neon fronteiras-nome" />
                            <span className="fronteiras-area" title="Parte do território pintado">{totalPintado ? Math.round(((celulas[f.id] || 0) / totalPintado) * 100) : 0}%</span>
                            <button type="button" className="fronteiras-remover" onClick={() => remover(f)} aria-label={`Remover ${f.nome}`}>🗑</button>
                        </li>
                    ))}
                    {facoes.length === 0 && <li className="fronteiras-vazio">Crie uma facção para começar a pintar.</li>}
                </ul>
                <button type="button" className="btn-neon fronteiras-nova" onClick={adicionar} disabled={facoes.length >= MAX_FACCOES}>➕ Nova facção</button>

                <div className="fronteiras-ferramentas" role="group" aria-label="Ferramenta">
                    <button type="button" className={`fronteiras-ferramenta${modo === 'pintar' ? ' ativa' : ''}`} onClick={() => setModo('pintar')} aria-pressed={modo === 'pintar'}>🖌 Pintar</button>
                    <button type="button" className={`fronteiras-ferramenta${modo === 'apagar' ? ' ativa' : ''}`} onClick={() => setModo('apagar')} aria-pressed={modo === 'apagar'}>🧽 Apagar</button>
                </div>
                <label className="fronteiras-raio">Pincel: {raio}
                    <input type="range" min={RAIO_MIN} max={RAIO_MAX} value={raio} onChange={(e) => setRaio(Number(e.target.value))} aria-label="Tamanho do pincel" />
                </label>
                <div className="fronteiras-acoes">
                    <button type="button" className="fronteiras-ferramenta" onClick={desfazer} disabled={!historico.current.length}>↩ Desfazer</button>
                    <button type="button" className="fronteiras-ferramenta" onClick={limparTudo} disabled={!totalPintado}>🗑 Limpar tudo</button>
                </div>
                <p className="fronteiras-dica">Arraste sobre o mapa para pintar. Os jogadores veem as mudanças na hora; só o Mestre edita.</p>
            </aside>
        </>
    );
}
