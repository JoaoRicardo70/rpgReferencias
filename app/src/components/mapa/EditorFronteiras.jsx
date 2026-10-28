import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    GRADE_L, GRADE_A, MAX_FACCOES, NOME_MAX, RAIO_MIN, RAIO_MAX, RAIO_PADRAO, PINCEIS, ZOOM_MIN, ZOOM_MAX, VISTA_INICIAL,
    celulaDoPonto, pintarCirculo, pintarTraco, apagarFaccaoDaGrade, novaFaccao, corValida, gradeIgual, gradeVazia, contarCelulas,
    limitarVista, zoomNoPonto
} from '../../core/fronteiras';
import { fronteirasPadrao } from '../../core/fronteirasPadrao';

const DESFAZER_MAX = 20;
const PASSO_ZOOM = 1.25;

// Painel do Mestre para "ajustar fronteiras": escolhe a facção, pinta ou apaga territórios arrastando sobre o mapa.
// O pai guarda o estado ({ facoes, grade }) e a vista (zoom/deslocamento) e salva (com debounce); aqui só se calcula a mudança.
// A superfície de pintura fica dentro do mapa ampliado; o painel vai para a janela (janelaRef), sem ampliar junto.
export default function EditorFronteiras({ facoes, grade, onMudar, onFechar, vista = VISTA_INICIAL, onVista, janelaRef }) {
    const [ativaId, setAtivaId] = useState(facoes[0]?.id || null);
    const [modo, setModo] = useState('pintar');
    const [raio, setRaio] = useState(RAIO_PADRAO);
    const [pincel, setPincel] = useState(null);
    const historico = useRef([]);
    const arrastando = useRef(null);
    const movendo = useRef(null);
    const superficie = useRef(null);
    const gradeAtual = useRef(grade);
    gradeAtual.current = grade;
    const vistaAtual = useRef(vista);
    vistaAtual.current = vista;

    const idAtivo = facoes.some((f) => f.id === ativaId) ? ativaId : (facoes[0]?.id || null);
    const podePintar = modo === 'apagar' || !!idAtivo;

    const celulaDoEvento = useCallback((e) => {
        const r = superficie.current.getBoundingClientRect();
        return celulaDoPonto(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    }, []);

    const medirJanela = useCallback(() => {
        const r = janelaRef?.current?.getBoundingClientRect();
        return r && r.width > 0 ? r : null;
    }, [janelaRef]);

    // A vista é guardada na ref na hora: vários eventos no mesmo quadro (roda do mouse) partem do valor mais recente.
    const mudarVista = useCallback((nova) => { vistaAtual.current = nova; if (onVista) onVista(nova); }, [onVista]);

    const aplicarZoom = useCallback((novaEscala, px, py) => {
        const r = medirJanela();
        if (!r || !onVista) return;
        mudarVista(zoomNoPonto(vistaAtual.current, novaEscala, px ?? r.width / 2, py ?? r.height / 2, r.width, r.height));
    }, [medirJanela, onVista, mudarVista]);

    // A roda do mouse amplia no ponto do cursor (precisa de listener não passivo para segurar a rolagem da página).
    useEffect(() => {
        const alvo = superficie.current;
        if (!alvo) return undefined;
        const aoRodar = (e) => {
            e.preventDefault();
            const r = medirJanela();
            if (!r) return;
            aplicarZoom(vistaAtual.current.escala * (e.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM), e.clientX - r.left, e.clientY - r.top);
        };
        alvo.addEventListener('wheel', aoRodar, { passive: false });
        return () => alvo.removeEventListener('wheel', aoRodar);
    }, [aplicarZoom, medirJanela]);

    const aplicar = useCallback((de, ate) => {
        const id = modo === 'apagar' ? '0' : idAtivo;
        if (id === null) return;
        const nova = de ? pintarTraco(gradeAtual.current, de, ate, raio, id) : pintarCirculo(gradeAtual.current, ate.cx, ate.cy, raio, id);
        if (nova !== gradeAtual.current) { gradeAtual.current = nova; onMudar({ facoes, grade: nova }); }
    }, [modo, idAtivo, raio, facoes, onMudar]);

    const aoPressionar = (e) => {
        // botão do meio, ou a ferramenta Mover: arrasta o mapa ampliado
        if (e.button === 1 || (modo === 'mover' && e.button <= 0)) {
            e.preventDefault();
            superficie.current.setPointerCapture?.(e.pointerId);
            movendo.current = { x: e.clientX, y: e.clientY };
            return;
        }
        if (modo === 'mover' || !podePintar || e.button > 0) return;
        e.preventDefault();
        superficie.current.setPointerCapture?.(e.pointerId);
        historico.current = [...historico.current.slice(-(DESFAZER_MAX - 1)), gradeAtual.current];
        const c = celulaDoEvento(e);
        arrastando.current = c;
        aplicar(null, c);
    };
    const aoMover = (e) => {
        if (movendo.current) {
            const r = medirJanela();
            if (r && onVista) {
                const v = vistaAtual.current;
                mudarVista(limitarVista({ escala: v.escala, x: v.x + e.clientX - movendo.current.x, y: v.y + e.clientY - movendo.current.y }, r.width, r.height));
            }
            movendo.current = { x: e.clientX, y: e.clientY };
            return;
        }
        const c = celulaDoEvento(e);
        setPincel({ cx: c.cx, cy: c.cy });
        if (!arrastando.current) return;
        aplicar(arrastando.current, c);
        arrastando.current = c;
    };
    const aoSoltar = () => {
        movendo.current = null;
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
    const restaurarPadrao = () => {
        if (!window.confirm('Voltar às fronteiras originais de cada região? O que você pintou e os nomes e cores das facções serão substituídos.')) return;
        const padrao = fronteirasPadrao();
        // o histórico guarda só a grade (não as facções): depois de trocar tudo, desfazer não teria como voltar certo
        historico.current = [];
        gradeAtual.current = padrao.grade;
        setAtivaId(padrao.facoes[0].id);
        onMudar({ facoes: padrao.facoes, grade: padrao.grade });
    };

    const celulas = contarCelulas(grade);
    const totalPintado = Object.values(celulas).reduce((a, b) => a + b, 0);
    const escala = vista.escala || 1;
    const classeSuperficie = modo === 'mover' ? ' fronteiras-superficie-mover' : (podePintar ? '' : ' fronteiras-superficie-bloqueada');

    const painel = (
        <aside className="fronteiras-painel" aria-label="Ajustar fronteiras">
            <header className="fronteiras-painel-topo">
                <h3>⚔️ Ajustar fronteiras</h3>
                <button type="button" className="fronteiras-fechar" onClick={onFechar} aria-label="Fechar o editor de fronteiras">✕</button>
            </header>

            <ul className="fronteiras-lista">
                {facoes.map((f) => (
                    <li key={f.id} className={`fronteiras-faccao${f.id === idAtivo && modo !== 'apagar' ? ' fronteiras-faccao-ativa' : ''}`}>
                        <input type="radio" name="fronteiras-faccao" checked={f.id === idAtivo} onChange={() => { setAtivaId(f.id); if (modo === 'apagar') setModo('pintar'); }} aria-label={`Pintar com ${f.nome}`} />
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
                <button type="button" className={`fronteiras-ferramenta${modo === 'mover' ? ' ativa' : ''}`} onClick={() => setModo('mover')} aria-pressed={modo === 'mover'} title="Arrastar o mapa ampliado (também com o botão do meio do mouse)">✋ Mover</button>
            </div>

            <div className="fronteiras-pinceis" role="group" aria-label="Tamanho do pincel">
                {PINCEIS.map((p) => (
                    <button key={p.nome} type="button" className={`fronteiras-ferramenta${raio === p.raio ? ' ativa' : ''}`} onClick={() => setRaio(p.raio)} aria-pressed={raio === p.raio} title={`Pincel ${p.nome} (raio ${p.raio})`}>{p.nome}</button>
                ))}
            </div>
            <label className="fronteiras-raio">Pincel: {raio}
                <input type="range" min={RAIO_MIN} max={RAIO_MAX} value={raio} onChange={(e) => setRaio(Number(e.target.value))} aria-label="Tamanho do pincel (ajuste fino)" />
            </label>

            <div className="fronteiras-zoom" role="group" aria-label="Zoom do mapa">
                <button type="button" className="fronteiras-ferramenta" onClick={() => aplicarZoom(escala / PASSO_ZOOM)} disabled={escala <= ZOOM_MIN} aria-label="Diminuir o zoom">➖</button>
                <span className="fronteiras-zoom-valor" aria-live="polite">Zoom {escala.toFixed(1).replace('.', ',')}×</span>
                <button type="button" className="fronteiras-ferramenta" onClick={() => aplicarZoom(escala * PASSO_ZOOM)} disabled={escala >= ZOOM_MAX} aria-label="Aumentar o zoom">➕</button>
                <button type="button" className="fronteiras-ferramenta" onClick={() => mudarVista(VISTA_INICIAL)} disabled={escala === 1} aria-label="Voltar ao zoom normal">⟲</button>
            </div>

            <div className="fronteiras-acoes">
                <button type="button" className="fronteiras-ferramenta" onClick={desfazer} disabled={!historico.current.length}>↩ Desfazer</button>
                <button type="button" className="fronteiras-ferramenta" onClick={limparTudo} disabled={!totalPintado}>🗑 Limpar tudo</button>
            </div>
            <button type="button" className="fronteiras-ferramenta" onClick={restaurarPadrao} title="Volta cada região ao território original">🗺 Restaurar fronteiras originais</button>
            <p className="fronteiras-dica">Arraste sobre o mapa para pintar; a roda do mouse amplia. Os jogadores veem as mudanças na hora; só o Mestre edita.</p>
        </aside>
    );
    // a div da janela (janelaRef) precisa existir antes do editor montar, senão o painel cai dentro da área ampliada
    const alvoPainel = janelaRef?.current || null;

    return (
        <>
            <div
                ref={superficie}
                className={`fronteiras-superficie${classeSuperficie}`}
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onPointerLeave={() => { setPincel(null); }}
                data-testid="fronteiras-superficie"
            >
                {pincel && podePintar && modo !== 'mover' && (
                    <span
                        className={`fronteiras-pincel${modo === 'apagar' ? ' fronteiras-pincel-apagar' : ''}`}
                        style={{ left: `${((pincel.cx + 0.5) / GRADE_L) * 100}%`, top: `${((pincel.cy + 0.5) / GRADE_A) * 100}%`, width: `${((raio * 2 + 1) / GRADE_L) * 100}%`, height: `${((raio * 2 + 1) / GRADE_A) * 100}%`, borderWidth: `${2 / escala}px`, borderColor: modo === 'apagar' ? '#ffffff' : (facoes.find((f) => f.id === idAtivo)?.cor || '#ffffff') }}
                    />
                )}
            </div>
            {alvoPainel ? createPortal(painel, alvoPainel) : painel}
        </>
    );
}
