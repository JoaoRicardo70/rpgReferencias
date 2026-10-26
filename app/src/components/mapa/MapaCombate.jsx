import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../stores/useStore';
import { useMapaForm, urlSeguraParaCss, calcularCA } from './MapaFormContext';
import { useAtaqueForm } from '../combate/AtaqueFormContext';
import { AtaquesSalvosChips } from '../combate/AtaqueSubComponents';
import { formulaDesatualizada, descreverAtaqueSalvo } from '../../core/ataquesSalvos';
import { getRotuloAcaoTecnica } from '../../core/acoesTecnica';
import { habilidadeEstaLigada, TIPO_HABILIDADE_PASSIVA } from '../../core/reducaoDano';
import { descreverAlvosReducao } from '../../core/reducaoRotulos';
import useGastarAcao from '../../hooks/useGastarAcao';
import SegurarAcao from '../combate/SegurarAcao';
import { tipoAcaoAoLigar } from '../../core/acaoPoder';
import { eventoCombina } from '../../core/atalhos';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { usePoderesForm } from '../poderes/PoderesFormContext';
import EstagioControle from '../poderes/EstagioControle';
import { temEstagios } from '../../core/estagios';
import { useArsenalForm } from '../arsenal/ArsenalFormContext';
import { useElementosForm, emogis as ELEMENTOS_EMOJIS, cores as ELEMENTOS_CORES } from '../arsenal/ElementosFormContext';
import { salvarDummie, salvarFichaSilencioso, salvarCenarioCompleto } from '../../services/firebase-sync';
import { getClassIconById } from '../../core/classIcons';
import { getAcoesExibicao, criarAcoesIniciais, restaurarAcoes, ACOES_MAXIMO } from '../../core/acoes';
import { calcularPoderAtual, calcularFatorMultiplicadorForca } from '../../core/poder';
import { calcularFadigaAtual } from '../../core/fadiga';
import { construirArvorePastas, contarNaPasta, listarCaminhosPastas, segmentosPasta } from '../../core/pastas';
import { getPoderDummie } from '../../core/disputaPoder';
import { estimarPoderDeEntidade, descreverEstimativaPoder, rotuloPrecisaoPoder, descreverCondicaoVida, getOcultacaoPoder, getTetoOcultacaoPoder } from '../../core/percepcaoPoder';
import { getVitalMax, getVitalMaxEstavel, calcVitalScale, calcularBarrasVida, calcularBarrasVidaDummy, FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import BarrasVida from '../shared/BarrasVida';
import { formatarPoderCosmico } from '../../core/utils';
import { idAlvoPersonagem, motivoBloqueioAlvo } from '../../core/alvoCombate';
import { getTipoPersonagem, rotuloTipoPersonagem } from '../../core/tipoPersonagem';
import { NIVEIS_ROLAGEM, indiceFaceDoDado, textoDaFace } from '../../core/rolagemDado';
import useBotaoArrastavel from '../../hooks/useBotaoArrastavel';

// 🔥 IMPORTAÇÕES PARA RENDERIZAR O DADO 3D FÍSICO 🔥
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import ParticulasDado from './ParticulasDado';
import { simularLancamento, quadroEm, velocidadeDoGesto } from '../../core/fisicaDado';
import * as THREE from 'three';

// ============================================================================
// 🎲 MOTOR 3D DO DADO D20 (REFATORADO PARA ALTO REALISMO)
// ============================================================================
// 🎲 `fisica` (opcional): { segurando, aoLancar, aoPousar(px) }. Com ele o dado cai, quica e rola de verdade (core/fisicaDado.js) e
// termina com a face do resultado virada pra câmera; `segurando` espera o jogador arrastar e soltar o dado para lançá-lo.
const ESCALA_FISICA = 0.4;
const RAIO_INSCRITO = 2.8 * 0.7947;

function DadoFisico3D({ isLanded, cor, valor, nivel, fisica }) {
    const meshRef = useRef();
    const sombraRef = useRef();
    const alvoRef = useRef(new THREE.Quaternion());
    const { gl, viewport, size } = useThree();
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const faseRef = useRef(fisica && fisica.segurando ? 'segurando' : 'iniciando');
    const simRef = useRef(null);
    const tRef = useRef(0);
    const posSegurandoRef = useRef([0, 0]);
    const amostrasRef = useRef([]);
    const arrastandoRef = useRef(false);
    const fisicaRef = useRef(fisica);
    fisicaRef.current = fisica;
    const isCritFatal = nivel === 'fatal';
    const isCritNormal = nivel === 'critico';
    const glowIntensity = isCritFatal ? 1.8 : isCritNormal ? 1.0 : 0.3;
    const indiceAlvo = indiceFaceDoDado(valor);
    const textoAlvo = textoDaFace(valor);
    const numeroForaDaFaixa = !(Number.isInteger(Number(valor)) && Number(valor) >= 1 && Number(valor) <= 20);

    // Geometria do d20 + uma "etiqueta" (plano com o número) colada em cada uma das 20 faces, como num dado de verdade.
    // Cada face tem uma orientação própria (z = normal, y = "para cima" do número): para pousar mostrando o resultado
    // basta girar o dado pelo inverso da orientação da face sorteada.
    const faces = useMemo(() => {
        const geo = new THREE.IcosahedronGeometry(2.8, 0);
        const pos = geo.getAttribute('position');
        const lista = [];
        for (let i = 0; i < 20; i++) {
            const v0 = new THREE.Vector3().fromBufferAttribute(pos, i * 3);
            const v1 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1);
            const v2 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2);
            const centro = new THREE.Vector3().add(v0).add(v1).add(v2).divideScalar(3);
            const normal = centro.clone().normalize();
            const cima = v0.clone().sub(centro).normalize();
            const direita = new THREE.Vector3().crossVectors(cima, normal).normalize();
            const orientacao = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(direita, cima, normal));
            lista.push({ centro, normal, orientacao });
        }
        return { geo, lista };
    }, []);

    // Uma textura de número por face (canvas); a face do resultado é redesenhada quando o valor não cabe em 1-20.
    const texturas = useMemo(() => {
        return Array.from({ length: 20 }, (_, i) => {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const tex = new THREE.CanvasTexture(canvas);
            tex.anisotropy = 4;
            tex.colorSpace = THREE.SRGBColorSpace;
            return { canvas, tex, i };
        });
    }, []);

    const desenharFace = useCallback((item, texto) => {
        const c = item.canvas.getContext('2d');
        if (!c) return;
        c.clearRect(0, 0, 256, 256);
        const tamanho = texto.length >= 4 ? 84 : texto.length === 3 ? 108 : 150;
        c.font = '900 ' + tamanho + 'px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineJoin = 'round';
        c.lineWidth = 14;
        c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.strokeText(texto, 128, 136);
        c.fillStyle = '#ffffff';
        c.fillText(texto, 128, 136);
        // 6 e 9 ganham um traço embaixo pra não serem confundidos de cabeça pra baixo.
        if (texto === '6' || texto === '9') c.fillRect(88, 214, 80, 12);
        item.tex.needsUpdate = true;
    }, []);

    useEffect(() => {
        texturas.forEach((t, i) => desenharFace(t, String(i + 1)));
    }, [texturas, desenharFace]);

    // Resultado fora de 1-20: a face do 20 passa a mostrar o número real.
    useEffect(() => {
        if (!isLanded) { desenharFace(texturas[19], '20'); return; }
        if (numeroForaDaFaixa) desenharFace(texturas[19], textoAlvo);
    }, [isLanded, numeroForaDaFaixa, textoAlvo, texturas, desenharFace]);

    // Orientação final: a face do resultado de frente pra câmera, número em pé, com uma leve inclinação pra dar volume.
    useEffect(() => {
        const inversa = faces.lista[indiceAlvo].orientacao.clone().invert();
        const inclinacao = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0.18, 0));
        alvoRef.current.copy(inclinacao).multiply(inversa);
    }, [faces, indiceAlvo]);

    // Textura de relevo (micro-ranhuras) do corpo do dado.
    const bumpTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, 512, 512);
            for (let i = 0; i < 4000; i++) {
                const tomCinza = Math.floor(Math.random() * 30) + 110;
                ctx.fillStyle = 'rgb(' + tomCinza + ',' + tomCinza + ',' + tomCinza + ')';
                ctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, []);

    // Libera a memória da GPU quando o dado some (o componente monta a cada rolagem).
    useEffect(() => () => {
        faces.geo.dispose();
        texturas.forEach(t => t.tex.dispose());
        bumpTexture.dispose();
    }, [faces, texturas, bumpTexture]);

    // Arena em unidades da cena: o chão fica no terço de baixo da tela e as paredes nas bordas.
    const arena = () => {
        const v = viewportRef.current;
        const apoio = RAIO_INSCRITO * ESCALA_FISICA;
        return { meiaLargura: Math.max(2, v.width / 2 - apoio * 1.3), piso: -v.height * 0.3 - apoio * 0.3, apoio, topo: v.height * 0.42 };
    };

    const lancar = (inicio, velocidade, centrar) => {
        const a = arena();
        const q = alvoRef.current;
        simRef.current = simularLancamento({
            inicio, velocidade, arena: a, alvo: [q.x, q.y, q.z, q.w], centrar,
            qInicial: [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, 1]
        });
        tRef.current = 0;
        faseRef.current = 'voando';
        if (fisicaRef.current && fisicaRef.current.aoLancar) fisicaRef.current.aoLancar();
    };

    // Lançamento automático: de cima, do lado esquerdo, caindo e quicando até o centro.
    useEffect(() => {
        if (!fisica || fisica.segurando) return;
        const a = arena();
        lancar([-a.meiaLargura * 0.85, a.topo * 0.6], [9, 5], true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- lança uma vez por dado (o componente remonta a cada rolagem)
    }, []);

    // Segurando: arrastar e soltar. Sem mexer por um tempo, o dado é lançado sozinho.
    useEffect(() => {
        if (!fisica || !fisica.segurando) return undefined;
        const el = gl.domElement;
        const mundo = (ev) => {
            const r = el.getBoundingClientRect();
            const v = viewportRef.current;
            const a = arena();
            const x = ((ev.clientX - r.left) / r.width - 0.5) * v.width;
            const y = (0.5 - (ev.clientY - r.top) / r.height) * v.height;
            return [Math.max(-a.meiaLargura, Math.min(a.meiaLargura, x)), Math.max(a.piso + a.apoio, Math.min(a.topo, y))];
        };
        const aoApertar = (ev) => {
            if (faseRef.current !== 'segurando') return;
            arrastandoRef.current = true;
            try { el.setPointerCapture(ev.pointerId); } catch (e) { /* sem captura */ }
            posSegurandoRef.current = mundo(ev);
            amostrasRef.current = [{ x: posSegurandoRef.current[0], y: posSegurandoRef.current[1], t: performance.now() }];
        };
        const aoMover = (ev) => {
            if (!arrastandoRef.current) return;
            posSegurandoRef.current = mundo(ev);
            amostrasRef.current.push({ x: posSegurandoRef.current[0], y: posSegurandoRef.current[1], t: performance.now() });
            if (amostrasRef.current.length > 12) amostrasRef.current.shift();
        };
        const aoSoltar = () => {
            if (!arrastandoRef.current) return;
            arrastandoRef.current = false;
            const v = velocidadeDoGesto(amostrasRef.current);
            const parado = Math.hypot(v[0], v[1]) < 4;
            // Soltou sem impulso (clique): joga pra frente com uma força padrão.
            lancar(posSegurandoRef.current, parado ? [8, 6] : v, parado);
        };
        const sozinho = setTimeout(() => { if (faseRef.current === 'segurando' && !arrastandoRef.current) lancar(posSegurandoRef.current, [8, 6], true); }, 7000);
        el.addEventListener('pointerdown', aoApertar);
        el.addEventListener('pointermove', aoMover);
        el.addEventListener('pointerup', aoSoltar);
        el.addEventListener('pointercancel', aoSoltar);
        return () => {
            clearTimeout(sozinho);
            el.removeEventListener('pointerdown', aoApertar);
            el.removeEventListener('pointermove', aoMover);
            el.removeEventListener('pointerup', aoSoltar);
            el.removeEventListener('pointercancel', aoSoltar);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- registra uma vez por dado
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        if (fisica) {
            const m = meshRef.current;
            m.scale.setScalar(ESCALA_FISICA);
            const a = arena();
            let altura = 0;
            if (faseRef.current === 'segurando') {
                // Paira no ar, girando devagar; segue o dedo/mouse enquanto é arrastado.
                const alvoPos = arrastandoRef.current ? posSegurandoRef.current : [0, a.piso + a.apoio + (a.topo - a.piso) * 0.25 + Math.sin(state.clock.elapsedTime * 2.2) * 0.12];
                if (!arrastandoRef.current) posSegurandoRef.current = alvoPos;
                m.position.set(alvoPos[0], alvoPos[1], 0);
                m.rotation.x += delta * 1.4; m.rotation.y += delta * 2.1;
                altura = alvoPos[1] - (a.piso + a.apoio);
            } else if (faseRef.current === 'voando' && simRef.current) {
                tRef.current += delta;
                const f = quadroEm(simRef.current, tRef.current);
                m.position.set(f.p[0], f.p[1], 0);
                m.quaternion.set(f.q[0], f.q[1], f.q[2], f.q[3]);
                altura = f.p[1] - (a.piso + a.apoio);
                if (tRef.current >= simRef.current.duracao) {
                    faseRef.current = 'pousado';
                    const v = viewportRef.current;
                    const px = (f.p[0] / v.width + 0.5) * size.width;
                    const py = (0.5 - f.p[1] / v.height) * size.height;
                    if (fisicaRef.current && fisicaRef.current.aoPousar) fisicaRef.current.aoPousar({ x: px, y: py });
                }
            } else if (faseRef.current === 'pousado') {
                m.quaternion.copy(alvoRef.current);
            }
            if (sombraRef.current) {
                const esc = Math.max(0.35, 1.25 - altura * 0.18);
                sombraRef.current.position.set(m.position.x, a.piso + 0.02, -0.4);
                sombraRef.current.scale.set(esc * 1.5, esc * 0.45, 1);
                sombraRef.current.material.opacity = Math.max(0.12, 0.62 - altura * 0.12);
            }
            return;
        }
        if (!isLanded) {
            // Giro caótico durante o arremesso.
            meshRef.current.rotation.x += delta * 13;
            meshRef.current.rotation.y += delta * 17;
            meshRef.current.rotation.z += delta * 9;
        } else {
            // Desacelera até assentar com a face do resultado virada pra câmera.
            meshRef.current.quaternion.slerp(alvoRef.current, 1 - Math.exp(-delta * 7));
        }
    });

    return (
        <group>
            <ambientLight intensity={0.6} />
            <directionalLight position={[8, 12, 14]} intensity={3.2} />
            <directionalLight position={[-12, 6, 8]} intensity={1.4} color="#484d6d" />
            <directionalLight position={[0, -15, -12]} intensity={2.2} color={cor} />
            <pointLight position={[0, 0, 6]} intensity={glowIntensity * 3} color={cor} distance={14} />

            {fisica && (
                <mesh ref={sombraRef}>
                    <circleGeometry args={[1, 32]} />
                    <meshBasicMaterial color="#000000" transparent opacity={0.5} depthWrite={false} />
                </mesh>
            )}
            <mesh ref={meshRef}>
                <primitive object={faces.geo} attach="geometry" />
                <meshPhysicalMaterial
                    color="#0a0a12"
                    emissive={cor}
                    emissiveIntensity={glowIntensity * 0.55}
                    roughness={0.22}
                    metalness={0.9}
                    bumpMap={bumpTexture}
                    bumpScale={0.012}
                    clearcoat={1.0}
                    clearcoatRoughness={0.05}
                />
                {/* Arestas luminosas do dado */}
                <mesh scale={[1.003, 1.003, 1.003]}>
                    <icosahedronGeometry args={[2.8, 0]} />
                    <meshBasicMaterial color={cor} wireframe transparent opacity={isCritFatal ? 0.85 : isCritNormal ? 0.6 : 0.4} />
                </mesh>
                {/* Números impressos nas faces */}
                {faces.lista.map((f, i) => (
                    <mesh key={i} position={f.centro.clone().addScaledVector(f.normal, 0.02)} quaternion={f.orientacao}>
                        <planeGeometry args={[1.7, 1.7]} />
                        <meshBasicMaterial map={texturas[i].tex} transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
                    </mesh>
                ))}
            </mesh>
        </group>
    );
}

const DADO_FECHADO = { ativo: false, numero: 20, finalResult: null, cor: '#00ffcc', nivel: 'normal', quemRolou: '' };

export function MapaDadoAnimado() {
    const ctx = useMapaForm();
    const { dadoAnim, abaAtiva, setDadoAnim } = ctx || {};

    // 🎲 Dado físico: quando ele avisa que pousou, o resultado aparece e, passado o tempo do nível, a cena fecha.
    const idFisico = dadoAnim && dadoAnim.fisica ? dadoAnim.id : null;
    const pousou = !!(dadoAnim && dadoAnim.fisica && dadoAnim.pousou);
    const duracaoMs = (dadoAnim && dadoAnim.duracaoMs) || 2000;
    useEffect(() => {
        if (!idFisico || !pousou || !setDadoAnim) return undefined;
        const t = setTimeout(() => setDadoAnim(prev => (prev && prev.id === idFisico ? DADO_FECHADO : prev)), duracaoMs);
        return () => clearTimeout(t);
    }, [idFisico, pousou, duracaoMs, setDadoAnim]);

    // Trava de segurança: se o dado nunca avisar que pousou (WebGL indisponível, aba trocada no meio do voo), a cena fecha sozinha.
    useEffect(() => {
        if (!idFisico || !setDadoAnim) return undefined;
        const t = setTimeout(() => setDadoAnim(prev => (prev && prev.id === idFisico ? DADO_FECHADO : prev)), 15000);
        return () => clearTimeout(t);
    }, [idFisico, setDadoAnim]);

    const painelMapa = document.querySelector('.mapa-panel');
    const mapaVisivel = painelMapa && (painelMapa.offsetWidth > 0 || painelMapa.offsetHeight > 0);
    const isAbaMapa = String(abaAtiva || '').toLowerCase().includes('map');

    if (!ctx || !dadoAnim?.ativo || (!mapaVisivel && !isAbaMapa && !dadoAnim.forcar)) return null;

    const fisica = !!dadoAnim.fisica;
    const isLanded = fisica ? !!dadoAnim.pousou : dadoAnim.finalResult != null;
    // No dado físico, nada do resultado vaza antes de ele pousar: cor, brilho e nível ficam neutros até lá.
    const esconderResultado = fisica && !isLanded;
    const nivel = esconderResultado ? 'normal' : (dadoAnim.nivel || 'normal');
    const corDado = esconderResultado ? (dadoAnim.corNeutra || NIVEIS_ROLAGEM.normal.cor) : dadoAnim.cor;
    const corTextoDado = esconderResultado ? (dadoAnim.corTextoNeutra || NIVEIS_ROLAGEM.normal.corTexto) : dadoAnim.corTexto;
    const info = NIVEIS_ROLAGEM[nivel] || NIVEIS_ROLAGEM.normal;
    // Efeitos especiais (⚙️ Configurações): intensos (padrão), suaves ou desligados.
    const efeitos = dadoAnim.efeitos || 'intensos';
    const comEfeitos = efeitos !== 'desligados';
    const intensos = efeitos === 'intensos';
    const comRaios = isLanded && comEfeitos && (nivel === 'fatal' || nivel === 'critico');
    const segurando = fisica && !!dadoAnim.segurando;
    const classes = ['dado-cena', 'dado-nivel-' + nivel, isLanded ? 'dado-pousou' : 'dado-no-ar'];
    if (fisica) classes.push('dado-fisica');
    if (segurando) classes.push('dado-segurando');
    if (isLanded && intensos && nivel === 'fatal') classes.push('dado-sacode');
    else if (isLanded && intensos && nivel === 'critico') classes.push('dado-sacode-leve');
    const posicaoPouso = dadoAnim.pouso || { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const aoLancar = () => setDadoAnim(prev => (prev && prev.id === dadoAnim.id ? { ...prev, segurando: false } : prev));
    const aoPousar = (px) => setDadoAnim(prev => (prev && prev.id === dadoAnim.id ? { ...prev, pousou: true, segurando: false, pouso: px } : prev));

    return createPortal(
        <div className={classes.join(' ')} style={{ '--cor-dado': corDado, '--cor-texto-dado': corTextoDado || info.corTexto }} aria-live="polite">
            <div className="dado-fundo" />
            {comRaios && <div className="dado-raios" />}
            {isLanded && comEfeitos && <div className="dado-onda" />}
            {isLanded && comEfeitos && intensos && nivel === 'fatal' && <div className="dado-clarao" />}

            {dadoAnim.quemRolou && <div className="dado-quem">{dadoAnim.quemRolou} {isLanded ? 'rolou' : (segurando ? 'vai lançar o dado' : 'está rolando...')}</div>}

            <div className="dado-palco">
                <div className="dado-canvas">
                    <Canvas camera={{ position: [0, 0, 8], fov: 50 }} style={{ width: '100%', height: '100%' }}>
                        <DadoFisico3D
                            key={dadoAnim.id || 'simples'}
                            isLanded={fisica ? true : isLanded}
                            cor={corDado} valor={dadoAnim.finalResult} nivel={nivel}
                            fisica={fisica ? { segurando, aoLancar, aoPousar } : undefined}
                        />
                    </Canvas>
                </div>
            </div>

            {segurando && <div className="dado-dica-mao">✋ Arraste o dado e solte para lançar!</div>}

            {isLanded && comEfeitos && (
                <ParticulasDado nivel={nivel} intensidade={intensos ? 'intensos' : 'suaves'} x={posicaoPouso.x} y={posicaoPouso.y} cor={dadoAnim.cor} />
            )}

            {isLanded && (
                <div className="dado-rotulo">
                    <span className="dado-rotulo-icone">{info.icone}</span> {info.rotulo}
                </div>
            )}
        </div>,
        document.body
    );
}

// ============================================================================
// O RESTO DO MÓDULO DE COMBATE
// ============================================================================
export function MapaEconomiaAcoes() {
    const ctx = useMapaForm();
    if (!ctx) return null;
    const { minhaFicha, meuNome, isMestre, jogadorHistory, dummies, personagens, toggleActionDot, jogadorDaVez } = ctx;

    let targetEntidade = { tipo: 'player', nome: meuNome, id: meuNome, data: minhaFicha };

    if (isMestre) {
        if (jogadorHistory) {
            const foundDummie = Object.entries(dummies || {}).find(([k,v]) => v.nome === jogadorHistory || k === jogadorHistory);
            if (foundDummie) targetEntidade = { tipo: 'dummie', nome: foundDummie[1].nome, id: foundDummie[0], data: foundDummie[1] };
            else if (personagens[jogadorHistory]) targetEntidade = { tipo: 'player', nome: jogadorHistory, id: jogadorHistory, data: personagens[jogadorHistory] };
        } else if (jogadorDaVez) {
            targetEntidade = { tipo: jogadorDaVez.isDummie ? 'dummie' : 'player', nome: jogadorDaVez.nome, id: jogadorDaVez.id || jogadorDaVez.nome, data: jogadorDaVez.ficha };
        }
    }

    // Jogadores/NPCs de ficha: máximo calculado (core/acoes.js); Dummies: o que o Mestre gravou (base 2).
    const acoes = targetEntidade.tipo === 'player' && targetEntidade.data ? getAcoesExibicao(targetEntidade.data) : (targetEntidade.data?.acoes || criarAcoesIniciais());
    const canEdit = targetEntidade.nome === meuNome || (isMestre && targetEntidade.tipo === 'dummie');

    const renderDots = (tipo, label, color) => {
        const max = Math.min(ACOES_MAXIMO, acoes[tipo]?.max ?? 2);
        const atual = acoes[tipo]?.atual || 0;
        const dots = [];
        for (let i = 0; i < max; i++) {
            const isAvail = i < atual;
            dots.push(
                <div key={i} onClick={() => canEdit && toggleActionDot(tipo, isAvail, targetEntidade.nome, targetEntidade.tipo === 'dummie', targetEntidade.id)}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: isAvail ? color : 'transparent', border: `2px solid ${color}`, cursor: canEdit ? 'pointer' : 'default', boxShadow: isAvail ? `0 0 8px ${color}` : 'none', opacity: isAvail ? 1 : 0.3 }}
                />
            );
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.65em', color: color, fontWeight: 'bold', textTransform: 'uppercase' }}>{label}</span>
                <div style={{ display: 'flex', gap: 4 }}>{dots}</div>
            </div>
        );
    };

    return (
        <>
        <div style={{ marginTop: 15, padding: '10px 15px', background: 'rgba(0,0,0,0.6)', border: '1px solid #333', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#fff', fontSize: '0.85em', fontWeight: 'bold' }}>⚡ Ações de: <span style={{ color: '#00ffcc' }}>{targetEntidade.nome}</span>{!canEdit && <span style={{ fontSize: '0.7em', color: '#888', marginLeft: 8 }}>(Apenas Visão)</span>}</span>
                {canEdit && (
                    <button onClick={() => {
                        if (targetEntidade.tipo === 'dummie') {
                            const dData = dummies[targetEntidade.id];
                            if(dData) {
                                const nAcoes = dData.acoes ? JSON.parse(JSON.stringify(dData.acoes)) : criarAcoesIniciais();
                                if (nAcoes.padrao) nAcoes.padrao.atual = nAcoes.padrao.max;
                                if (nAcoes.bonus) nAcoes.bonus.atual = nAcoes.bonus.max;
                                if (nAcoes.reacao) nAcoes.reacao.atual = nAcoes.reacao.max;
                                salvarDummie(targetEntidade.id, { ...dData, acoes: nAcoes });
                            }
                        } else {
                            ctx.updateFicha(f => {
                                restaurarAcoes(f);
                            });
                            salvarFichaSilencioso();
                        }
                    }} style={{ background: 'none', border: '1px solid #555', color: '#aaa', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: '0.8em' }}>↻ Resetar</button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
                {renderDots('padrao', 'Ação', '#00ffcc')}
                {renderDots('bonus', 'Bônus', '#ffcc00')}
                {renderDots('reacao', 'Reação', '#ff00ff')}
            </div>
        </div>
        {/* ⏳ Segurar Ação (Hold Action): só pra mim mesmo; dos outros o Feed já avisa. */}
        {targetEntidade.tipo === 'player' && targetEntidade.nome === meuNome && <SegurarAcao />}
        </>
    );
}

export function MapaIniciativaTracker() {
    const ctx = useMapaForm();
    const {
        minhaFicha, iniciativaInput, setIniciativaInput, isMestre, sairDoCombate, encerrarCombate, descansar,
        setMinhaIniciativa, avancarTurno, ordemIniciativa, turnoAtualIndex, jogadorHistory,
        setJogadorHistory, feedCombate, getAvatarInfo, fmt, jogadorDaVez, infoDaVez, cenario,
        jogadores, dummies, cenaRenderId, inspecao, inspecionar
    } = ctx || {};

    const todasEntidades = useMemo(() => {
        // Jogador pode ter a posição no sistema novo (posicoes[cenaId]) ou no antigo (posicao.cenaId) —
        // mesma lógica de tokenMap/ordemIniciativa em MapaFormContext, senão ele "vaza" para toda cena
        // que caia no fallback 'default'.
        const estaNaCena = (f) => {
            const pos = f.posicoes ? f.posicoes[cenaRenderId] : null;
            if (pos) return true;
            return !!(f.posicao && (f.posicao.cenaId || 'default') === cenaRenderId);
        };
        const js = Object.entries(jogadores || {}).filter(([n, f]) => estaNaCena(f)).map(([n, f]) => ({ id: n, nome: n, ficha: f, isDummie: false, init: f.iniciativa || 0 }));
        const ds = Object.entries(dummies || {}).filter(([id, d]) => (d.cenaId || 'default') === cenaRenderId).map(([id, d]) => ({ id, nome: d.nome, ficha: d, isDummie: true, init: d.iniciativa || 0 }));
        return [...js, ...ds].sort((a, b) => b.init - a.init);
    }, [jogadores, dummies, cenaRenderId]);

    if (!ctx) return null;

    const toggleVisibilidadeToken = (e, idOuNome) => {
        e.stopPropagation();
        const novoCenario = JSON.parse(JSON.stringify(cenario || {}));
        if (!novoCenario.tokensOcultos) novoCenario.tokensOcultos = [];
        if (novoCenario.tokensOcultos.includes(idOuNome)) {
            novoCenario.tokensOcultos = novoCenario.tokensOcultos.filter(t => t !== idOuNome);
        } else {
            novoCenario.tokensOcultos.push(idOuNome);
        }
        salvarCenarioCompleto(novoCenario);
    };

    return (
        <div className="def-box" style={{ marginTop: 15, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <h3 style={{ color: '#00ffcc', margin: 0, fontSize: '1.1em' }}>⚡ Iniciativa & Entidades</h3>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input className="input-neon" type="number" value={iniciativaInput} onChange={e => setIniciativaInput(e.target.value)} style={{ width: 50, padding: 4, height: 26, margin: 0 }} />
                        <button className="btn-neon btn-gold" onClick={setMinhaIniciativa} style={{ padding: '2px 8px', fontSize: '0.8em', margin: 0 }}>Rolar</button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-neon" onClick={avancarTurno} style={{ borderColor: '#00ffcc', color: '#00ffcc', padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>Passar Turno</button>
                    {/* 💖 Só aparece FORA de combate (iniciativa zerada) — senão daria pra zerar a
                        Fadiga acumulada a qualquer momento no meio da luta, esvaziando o sentido do
                        desgaste progressivo. "Sair" primeiro (iniciativa=0), depois "Descansar". */}
                    {!(minhaFicha?.iniciativa > 0) && <button className="btn-neon btn-green" onClick={descansar} title="Recupera toda a Vida/Energias e zera a Fadiga e o mUnico Crescente acumulados" style={{ padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>💖 Descansar</button>}
                    {minhaFicha?.iniciativa > 0 && <button className="btn-neon btn-red" onClick={sairDoCombate} style={{ padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>Sair</button>}
                    {isMestre && <button className="btn-neon" onClick={encerrarCombate} style={{ borderColor: '#ff003c', color: '#ff003c', padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>Zerar</button>}
                </div>
            </div>

            <div id="lista-turnos" style={{ display: 'flex', gap: 8, marginTop: 15, overflowX: 'auto', paddingBottom: 5, minHeight: 50 }}>
                {todasEntidades.length === 0 ? <p style={{ color: '#888', fontSize: '0.8em', margin: 0 }}>Nenhuma entidade no mapa.</p> : (
                    todasEntidades.map((entidade) => {
                        const isOculto = cenario?.tokensOcultos?.includes(entidade.id);
                        if (!isMestre && isOculto) return null;

                        const info = getAvatarInfo(entidade.ficha);
                        const isRolled = entidade.init > 0;
                        const isActive = isRolled && (ordemIniciativa || []).length > 0 && (ordemIniciativa[turnoAtualIndex % ordemIniciativa.length]?.nome === entidade.nome);
                        return (
                            <div key={entidade.id} style={{ position: 'relative' }}>
                                <div
                                    onClick={() => { setJogadorHistory(entidade.nome); inspecionar(entidade.isDummie ? 'dummie' : 'jogador', entidade.id); }}
                                    title={`${entidade.nome} — clique para ver o resumo`}
                                    className={inspecao && inspecao.id === entidade.id && inspecao.isDummie === entidade.isDummie ? 'token-inspecionado' : undefined}
                                    style={{
                                    cursor: 'pointer', minWidth: 40, height: 40, borderRadius: '50%',
                                    border: isActive ? '3px solid #00ffcc' : (isRolled ? '2px solid #aaa' : '2px dashed #444'),  
                                    opacity: isActive ? 1 : (isOculto ? 0.3 : (isRolled ? 0.8 : 0.5)), 
                                    backgroundImage: urlSeguraParaCss(info.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'top center', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.7em', color: 'white', textShadow: '1px 1px 2px black' 
                                }}>{!info.img && entidade.nome.charAt(0)}</div>
                                {isMestre && <button onClick={(e) => toggleVisibilidadeToken(e, dynamicTokenId => toggleVisibilidadeToken(e, entidade.id))} style={{ position: 'absolute', top: -5, right: -5, background: isOculto ? '#ff003c' : '#000', borderRadius: '50%', padding: '2px 4px', fontSize: '10px', cursor: 'pointer', border: '1px solid #fff' }}>{isOculto ? '👻' : '👁️'}</button>}
                            </div>
                        );
                    })
                )}
            </div>

            <MapaEconomiaAcoes />

            {jogadorHistory && (
                <div style={{ marginTop: 15, padding: 15, background: 'rgba(0, 20, 40, 0.8)', border: '1px solid #0088ff', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h4 style={{ margin: 0, color: '#0088ff' }}>Histórico: {jogadorHistory}</h4>
                        <button className="btn-neon btn-red" onClick={() => setJogadorHistory(null)} style={{ padding: '2px 8px', fontSize: '0.8em', margin: 0 }}>X</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                        {(feedCombate || []).filter(f => f.nome === jogadorHistory).slice(-6).reverse().map((h, i) => (
                            <div key={i} style={{ fontSize: '0.85em', color: '#ccc', background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 5, borderLeft: `3px solid ${h.tipo === 'dano' ? '#ff003c' : '#f90'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><strong style={{ color: h.tipo === 'dano' ? '#ff003c' : h.tipo === 'acerto' ? '#f90' : '#0088ff', textTransform: 'uppercase' }}>[{h.tipo}]</strong>{h.acertoTotal && <strong style={{ color: '#fff' }}>Total: {fmt(h.acertoTotal)}</strong>}{h.dano && <strong style={{ color: '#fff' }}>Dano: {fmt(h.dano)}</strong>}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {jogadorDaVez && (
                <div style={{ marginTop: 15, display: 'flex', gap: 15, alignItems: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid #00ffcc', backgroundImage: urlSeguraParaCss(infoDaVez?.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em', fontWeight: 'bold', color: '#fff' }}>{(!infoDaVez || !infoDaVez.img) && jogadorDaVez.nome.charAt(0)}</div>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1em' }}>{jogadorDaVez.nome}</div>
                        {infoDaVez?.forma && <div style={{ color: '#00ffcc', fontSize: '0.8em' }}>{infoDaVez.forma}</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

export function MapaRolagemRapida() {
    const ctx = useMapaForm();
    if (!ctx) return null;
    const { mapStat, setMapStat, mapQD, setMapQD, mapFD, setMapFD, mapBonus, setMapBonus, mapVantagens, changeVantagem, mapDesvantagens, changeDesvantagem, mapUsarProf, setMapUsarProf, rolarAcertoRapido } = ctx;

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', border: '1px solid #f90' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h4 style={{ color: '#f90', margin: 0 }}>🎯 Ação Rápida</h4>
                <select className="input-neon" value={mapStat} onChange={e => setMapStat(e.target.value)} style={{ padding: '2px 4px', width: 90, height: 26, margin: 0 }}>
                    <option value="forca">Força</option><option value="destreza">Des</option><option value="inteligencia">Int</option><option value="sabedoria">Sab</option>
                    <option value="energiaEsp">Aura</option><option value="carisma">Car</option><option value="stamina">Sta</option><option value="constituicao">Con</option>
                </select>
                <input className="input-neon" type="number" value={mapQD} onChange={e => setMapQD(e.target.value)} style={{ width: 40, padding: 2, height: 26, margin: 0 }} /> <span style={{ color: '#aaa', fontWeight: 'bold' }}>D</span>
                <input className="input-neon" type="number" value={mapFD} onChange={e => setMapFD(e.target.value)} style={{ width: 45, padding: 2, height: 26, margin: 0 }} /> <span style={{ color: '#aaa', fontWeight: 'bold' }}>+</span>
                <input className="input-neon" type="number" value={mapBonus} onChange={e => setMapBonus(e.target.value)} style={{ width: 45, padding: 2, height: 26, margin: 0 }} />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid #444', paddingLeft: 15 }}>
                <span style={{ color: '#0f0', fontWeight: 'bold', fontSize: '0.85em' }}>V:</span>
                <input className="input-neon" type="number" min="0" value={mapVantagens} onChange={changeVantagem} style={{ width: 40, padding: 2, height: 26, margin: 0, borderColor: '#0f0', color: '#0f0' }} />
                <span style={{ color: '#f00', fontWeight: 'bold', fontSize: '0.85em' }}>D:</span>
                <input className="input-neon" type="number" min="0" value={mapDesvantagens} onChange={changeDesvantagem} style={{ width: 40, padding: 2, height: 26, margin: 0, borderColor: '#f00', color: '#f00' }} />
                <label style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 5 }}><input type="checkbox" checked={mapUsarProf} onChange={e => setMapUsarProf(e.target.checked)} /> Prof</label>
            </div>

            <div style={{ flex: 1, textAlign: 'right' }}>
                <button className="btn-neon btn-gold" onClick={rolarAcertoRapido} style={{ margin: 0, padding: '4px 15px' }}>🎲 ROLAR</button>
            </div>
        </div>
    );
}

// 🔥 Acesso rápido, direto do Mapa, aos "Ataques Salvos" (ficha.ataqueConfig.formulasSalvas —
// mesmas fórmulas de Modo Deus salvas na aba Ataque, ver AtaqueSubComponents.jsx >
// AtaqueDanoCustomizado) — antes o jogador precisava sair do Mapa e ir pra aba Ataque só pra rolar
// uma fórmula que já tinha salvo. Reusa a MESMA rolarDanoCustomizado (AtaqueFormContext.jsx) —
// mesmo cálculo de dado/dano/consumo de energia e mesmo feed de combate — contra o `alvoSelecionado`
// atual (estado global compartilhado com o clique-pra-mirar dos tokens da própria grelha do Mapa,
// ver components/combat/DummieToken.jsx), então não existe uma segunda lógica de dano duplicada
// aqui. Precisa do seu próprio <AtaqueFormProvider> (ver MapaPanel.jsx) — é um provider TOTALMENTE
// à parte da instância que já vive (sempre montada) na aba Ataque, cada um com seu próprio estado
// local (o texto digitado no Modo Deus etc.); não há nada compartilhado entre as duas instâncias
// além do que já vem do Zustand (minhaFicha, alvoSelecionado).
export function MapaAtaquesSalvos() {
    const ataqueCtx = useAtaqueForm();
    if (!ataqueCtx) return null;
    const { minhaFicha, rolarDanoCustomizado, dummieAlvo } = ataqueCtx;
    const formulasSalvas = minhaFicha?.ataqueConfig?.formulasSalvas || [];

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #ff00ff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h4 style={{ color: '#ff00ff', margin: 0 }}>⚔️ Meus Ataques Salvos</h4>
                <span style={{ color: dummieAlvo ? '#0f0' : '#888', fontSize: '0.8em', fontStyle: 'italic' }}>
                    {dummieAlvo ? `🎯 Alvo: ${dummieAlvo.nome}` : 'Nenhum alvo selecionado'}
                </span>
            </div>

            <AtaquesSalvosChips comExcluir={false} />
            {formulasSalvas.length === 0 && !(minhaFicha?.ataqueConfig?.ataquesSalvos || []).length ? (
                <p style={{ color: '#888', fontSize: '0.8em', margin: '8px 0 0 0' }}>
                    Nenhum ataque salvo ainda. Vá na aba <strong>Ataque</strong> → Modo Deus, monte sua fórmula e clique em 💾 pra poder disparar ela direto por aqui.
                </p>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {formulasSalvas.map(f => (
                        <button
                            key={f.id}
                            className="btn-neon"
                            onClick={() => rolarDanoCustomizado(f.formula, f.letalidade, f.energiaTipo, f.energiaCusto)}
                            title={`Fórmula: ${f.formula} | Letalidade: +${f.letalidade || 0}${f.energiaTipo && f.energiaTipo !== 'nenhum' && f.energiaCusto ? ` | Custo: ${f.energiaCusto}% ${f.energiaTipo}` : ''}`}
                            style={{ margin: 0, padding: '6px 14px', background: 'rgba(255,0,255,0.15)', borderColor: '#ff00ff', color: '#ff00ff', fontWeight: 'bold' }}
                        >
                            ▶ {f.nome}{formulaDesatualizada(f) ? <span className="ataque-salvo-aviso" title="Salva antes da mudança de números: refaça com 💾 Salvar Ataque."> ⚠️ antiga</span> : null}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const SEM_ATAQUES = [];

// 🛡️ Aba "Defesas" do Livro: as Habilidades de Redução de Dano da ficha. Ativas ligam/desligam (cobrando a Ação que
// custam, core/acoesTecnica.js); Passivas valem sempre e só aparecem. Criar/editar continua na página do Grimório.
function MapaLivroDefesas() {
    const { ficha, updateFicha } = useFichaAtiva();
    const salvar = useCallSaveAtivo();
    const gastarAcao = useGastarAcao();
    const reducoes = ((ficha && ficha.reducoesDano) || SEM_ATAQUES).filter(Boolean);
    const passivas = reducoes.filter(r => r.tipo === TIPO_HABILIDADE_PASSIVA);
    const ativas = reducoes.filter(r => r.tipo !== TIPO_HABILIDADE_PASSIVA);

    const alternar = (r) => {
        const ligando = !habilidadeEstaLigada(r);
        if (ligando && !gastarAcao(r)) return;
        updateFicha(f => { const x = (f.reducoesDano || []).find(i => i && i.id === r.id); if (x) x.ativa = ligando; });
        salvar();
    };
    const detalhe = (r) => [ (Number(r.percentual) || 0) + '%', descreverAlvosReducao(r), getRotuloAcaoTecnica(r.tipoAcao) ].filter(Boolean).join(' · ');

    return (
        <div className="def-box">
            <h4>🛡️ Habilidades de Redução de Dano</h4>
            {reducoes.length === 0 && <p className="mapa-tecnicas-vazia">Nenhuma habilidade de redução criada ainda. Crie no Grimório (Estados, Afinidades & Reduções).</p>}
            {passivas.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <div className="mapa-tecnicas-categoria">🛡️ Passivas <span className="mapa-categoria-total">({passivas.length}) — sempre ligadas</span></div>
                    <div className="mapa-tecnicas-grade">
                        {passivas.map(r => <span key={r.id} className="mapa-defesa-passiva" title={r.descricao || ''}>✦ {r.nome || 'Sem nome'} <span className="mapa-chip-acao">· {detalhe(r)}</span></span>)}
                    </div>
                </div>
            )}
            {ativas.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <div className="mapa-tecnicas-categoria">⚡ Ativas <span className="mapa-categoria-total">({ativas.length}) — liga/desliga</span></div>
                    <div className="mapa-tecnicas-grade">
                        {ativas.map(r => {
                            const ligada = habilidadeEstaLigada(r);
                            return (
                                <button key={r.id} className={`btn-neon mapa-tecnica-chip${ligada ? ' mapa-tecnica-chip--ligada' : ''}`} aria-pressed={ligada} onClick={() => alternar(r)} title={r.descricao || ''}>
                                    {ligada ? '★' : '☆'} {r.nome || 'Sem nome'}<span className="mapa-chip-acao"> · {detalhe(r)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// 📖 Atalho dos Ataques Salvos no Mapa, no estilo do Livro da Entidade do Mestre (components/mestre/LivroEntidade.jsx):
// um botão pequeno e fixo no canto inferior esquerdo (não ocupa espaço no layout do Mapa) abre o "Livro" em tela
// cheia, com a barra de abas e "FECHAR LIVRO" e uma carta por ataque salvo mostrando o que ele usa. É SÓ PARA USAR:
// nada de criar ou editar técnicas aqui (isso continua nas abas Ataque/Grimório). Clique na carta (ou a tecla 1-9)
// executa com o mesmo rolarAtaqueSalvo/rolarDanoCustomizado do AtaqueFormContext: mesmo cálculo, alvo e trava de Acerto.
// Tudo vai em portal no body: o painel da aba usa backdrop-filter, que prenderia o position: fixed dentro dele.
export function MapaAtalhoAtaques() {
    // O botão do Livro é arrastável (e lembra o lugar): o jogador o tira da frente de qualquer outro botão do Mapa.
    const flutuante = useBotaoArrastavel('rpg_livro_combate_pos', { largura: 64, altura: 38, topoReservado: 60 });
    const ataqueCtx = useAtaqueForm();
    const [aberto, setAberto] = useState(false);
    // Abas do Livro: ataques salvos, Habilidades/Formas/Poderes e Técnicas Elementais (as duas últimas são as mesmas
    // listas do Mapa — ligar/desligar e memorizar —, sem criar nem editar nada).
    const [aba, setAba] = useState('ataques');
    const poderesCtx = usePoderesForm();
    const elemCtx = useElementosForm();
    const livroRef = useRef(null);

    const minhaFicha = ataqueCtx ? ataqueCtx.minhaFicha : null;
    const salvos = (minhaFicha && minhaFicha.ataqueConfig && minhaFicha.ataqueConfig.ataquesSalvos) || SEM_ATAQUES;
    const formulas = (minhaFicha && minhaFicha.ataqueConfig && minhaFicha.ataqueConfig.formulasSalvas) || SEM_ATAQUES;
    const slots = useMemo(() => [
        ...salvos.map(a => ({ chave: 'a' + a.id, nome: a.nome, antiga: false, registro: a })),
        ...formulas.map(f => ({ chave: 'f' + f.id, nome: f.nome, antiga: formulaDesatualizada(f), formula: f }))
    ], [salvos, formulas]);

    const liberado = !!ataqueCtx && (ataqueCtx.podeRolarDano || ataqueCtx.ignorarTravaAcerto);
    const rolarAtaqueSalvo = ataqueCtx ? ataqueCtx.rolarAtaqueSalvo : null;
    const rolarDanoCustomizado = ataqueCtx ? ataqueCtx.rolarDanoCustomizado : null;

    const poderes = ((minhaFicha && minhaFicha.poderes) || SEM_ATAQUES).filter(Boolean);
    const magias = ((minhaFicha && minhaFicha.ataquesElementais) || SEM_ATAQUES).filter(Boolean);
    const armasInv = ((minhaFicha && minhaFicha.inventario) || SEM_ATAQUES).filter(i => i && i.tipo === 'arma');
    const reducoesFicha = ((minhaFicha && minhaFicha.reducoesDano) || SEM_ATAQUES).filter(Boolean);
    const abasLivro = [
        ataqueCtx && { id: 'arma', rotulo: '🗡️ Arma', total: armasInv.length },
        slots.length > 0 && { id: 'ataques', rotulo: '⚔️ Ataques Salvos', total: slots.length },
        poderesCtx && poderes.length > 0 && { id: 'tecnicas', rotulo: '✨ Habilidades · Formas · Poderes', total: poderes.length, ligadas: poderes.filter(p => p && p.ativa).length },
        elemCtx && magias.length > 0 && { id: 'elementais', rotulo: '🌪️ Técnicas Elementais', total: magias.length, ligadas: magias.filter(m => m && m.equipado).length },
        reducoesFicha.length > 0 && { id: 'defesas', rotulo: '🛡️ Defesas', total: reducoesFicha.length, ligadas: reducoesFicha.filter(r => habilidadeEstaLigada(r)).length }
    ].filter(Boolean);
    const temConteudo = abasLivro.length > 0;
    // Se a aba escolhida some (ex.: o último ataque salvo foi apagado), cai na primeira que existe.
    const abaEfetiva = (abasLivro.find(a => a.id === aba) || abasLivro[0] || {}).id;
    // Se não sobra nada com o livro aberto, ele fecha (não reaparece sozinho depois).
    useEffect(() => { if (!temConteudo) setAberto(false); }, [temConteudo]);

    const usar = useCallback((slot) => {
        if (!slot) return;
        // Só fecha o Livro se o ataque realmente rolou (erro/alerta ou confirmação cancelada deixam aberto).
        const rolou = slot.registro ? rolarAtaqueSalvo(slot.registro) : rolarDanoCustomizado(slot.formula.formula, slot.formula.letalidade, slot.formula.energiaTipo, slot.formula.energiaCusto);
        if (rolou !== false) setAberto(false);
    }, [rolarAtaqueSalvo, rolarDanoCustomizado]);

    // Fecha com Esc ou clicando fora do livro; teclas 1-9 usam o slot (ignora digitação em campos e modificadores).
    useEffect(() => {
        if (!aberto) return undefined;
        const aoTecla = (e) => {
            if (e.key === 'Escape') { setAberto(false); return; }
            if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
            const alvo = e.target;
            if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
            if (abaEfetiva === 'ataques' && /^[1-9]$/.test(e.key) && liberado) usar(slots[Number(e.key) - 1]);
        };
        // Clique no fundo vazio do livro (fora da barra e do corpo) fecha; clique em qualquer outra coisa fora dele também.
        const aoClicarFora = (e) => { if (livroRef.current && (e.target === livroRef.current || !livroRef.current.contains(e.target))) setAberto(false); };
        document.addEventListener('keydown', aoTecla);
        document.addEventListener('mousedown', aoClicarFora);
        return () => { document.removeEventListener('keydown', aoTecla); document.removeEventListener('mousedown', aoClicarFora); };
    }, [aberto, slots, liberado, usar, abaEfetiva]);

    // Tecla de atalho (⚙️ Configurações; padrão Alt+L) abre/fecha o Livro de Combate.
    useEffect(() => {
        if (!temConteudo) return undefined;
        const aoTecla = (e) => {
            if (e.repeat || !eventoCombina(e, 'livroCombate')) return;
            e.preventDefault();
            setAberto(v => !v);
        };
        window.addEventListener('keydown', aoTecla);
        return () => window.removeEventListener('keydown', aoTecla);
    }, [temConteudo]);

    if (!ataqueCtx || !temConteudo || typeof document === 'undefined' || !document.body) return null;
    const alvo = ataqueCtx.dummieAlvo;

    return createPortal(
        <>
            <div className="atalho-ataques" style={{ left: flutuante.pos.x, top: flutuante.pos.y }}>
                <button className="atalho-ataques-botao" onPointerDown={flutuante.aoPressionar} onClick={() => { if (flutuante.consumirArrasto()) return; setAberto(v => !v); }} aria-expanded={aberto} title="Atalho dos Ataques Salvos">
                    ⚔️{slots.length > 0 ? ' ' + slots.length : ''}
                </button>
            </div>
            {aberto && (
                <div className="livro-entidade-fundo atalho-livro-fundo" ref={livroRef} role="dialog" aria-label="Livro dos Ataques Salvos">
                    {/* Capa de couro: marcadores de fita (abas), duas páginas com lombada e o rodapé */}
                    <div className="atalho-livro-capa">
                    <div className="livro-entidade-barra atalho-livro-barra">
                        <div className="livro-entidade-abas atalho-livro-marcadores" role="tablist" aria-label="Ataques salvos">
                            {abasLivro.map(a => (
                                <button key={a.id} type="button" role="tab" aria-selected={abaEfetiva === a.id} className={`grimorio-mestre-aba atalho-livro-marcador${abaEfetiva === a.id ? ' ativa' : ''}`} onClick={() => setAba(a.id)}>
                                    {a.rotulo} <small>{a.ligadas !== undefined ? `★ ${a.ligadas}/${a.total}` : a.total}</small>
                                </button>
                            ))}
                        </div>
                        <h2 className="atalho-livro-titulo">📖 Livro de Combate</h2>
                        <button type="button" className="livro-entidade-fechar" onClick={() => setAberto(false)}>❌ FECHAR LIVRO</button>
                    </div>
                    <div className="atalho-livro-miolo">
                    <div className="livro-entidade-corpo atalho-livro-corpo atalho-livro-paginas" role="tabpanel">
                        {abaEfetiva === 'arma' && <div className="atalho-livro-modulo"><MapaAtaqueArma aoRolar={() => setAberto(false)} /></div>}
                        {abaEfetiva === 'defesas' && <div className="atalho-livro-modulo"><MapaLivroDefesas /></div>}
                        {abaEfetiva === 'ataques' && (<>
                        <div className="atalho-livro-topo">
                            <span className={alvo ? 'atalho-ataques-alvo' : 'atalho-ataques-sem-alvo'}>{alvo ? '🎯 ' + alvo.nome : 'Sem alvo'}</span>
                            {!liberado && <span className="atalho-ataques-aviso">Acerto necessário antes de rolar o dano.</span>}
                            <span className="atalho-livro-dica">Clique numa carta ou aperte 1-9 para usar.</span>
                        </div>
                        <div className="atalho-livro-grade">
                            {slots.map((s, i) => {
                                const resumo = s.registro ? descreverAtaqueSalvo(s.registro, { ficha: minhaFicha, poderesAtivos: ataqueCtx.poderesAtivos, magiasOfensivas: ataqueCtx.magiasOfensivas, armaEquipada: ataqueCtx.armaEquipada }) : null;
                                return (
                                    <button key={s.chave} className="atalho-livro-carta" disabled={!liberado} onClick={() => usar(s)} title={s.antiga ? 'Fórmula antiga (números antigos): refaça com 💾 Salvar Ataque' : 'Executar com o cálculo atual'}>
                                        {i < 9 && <span className="atalho-ataques-tecla">{i + 1}</span>}
                                        <span className="atalho-ataques-nome">{s.nome}</span>
                                        {s.antiga && <span className="atalho-ataques-antiga">⚠️</span>}
                                        {resumo && (
                                            <span className="atalho-livro-detalhes">
                                                {resumo.arma && <span>🗡️ {resumo.arma.nome}{resumo.arma.atributos.length > 0 ? ' (' + resumo.arma.atributos.join(' + ') + ')' : ''}</span>}
                                                {resumo.itens.map(it => (
                                                    <span key={it.tipo + it.id} className={it.ativo ? '' : 'atalho-livro-inativo'}>
                                                        {it.tipo === 'tecnica' ? '🔮' : '✨'} {it.nome}{it.comoPoder ? ' · como Poder' : ''}{it.ativo ? '' : ' (inativa)'}
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                        {s.antiga && <span className="atalho-livro-detalhes"><span>Fórmula de texto antiga</span></span>}
                                        <span className="atalho-livro-usar">▶ USAR</span>
                                    </button>
                                );
                            })}
                        </div>
                        </>)}
                        {abaEfetiva === 'tecnicas' && <div className="atalho-livro-modulo"><MapaTecnicasRapidas /></div>}
                        {abaEfetiva === 'elementais' && <div className="atalho-livro-modulo"><MapaMagiasElementais /></div>}
                    </div>
                    </div>
                    <div className="atalho-livro-rodape" aria-hidden="true">✦ ✦ ✦</div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}


// 🔥 Ataque com a Arma equipada, direto do Mapa — reusa o MESMO rolarDano (AtaqueFormContext.jsx)
// e a MESMA trava de Acerto (podeRolarDano/ignorarTravaAcerto) que o botão "ATACAR"/"ROLAR DANO"
// da aba Ataque já usa (ver AtaqueSubComponents.jsx > AtaqueBotoesAcao), inclusive o mesmo
// requisito de ter Acertado o alvo primeiro na aba Acerto (ou marcar "Ignorar Trava"). Não é uma
// segunda regra de combate — é o MESMO botão, só que sem precisar sair do Mapa pra clicar nele.
//
// 🗡️ Troca rápida de arma: o sistema só permite UMA arma equipada por vez (equipar uma desequipa
// a outra automaticamente, ver ArsenalFormContext.jsx > toggleEquiparItem — não existe "dual
// wielding"), então "múltiplas Armas Salvas" na prática significa poder TROCAR de arma rápido sem
// sair do Mapa pra ir na aba Arsenal. Lista todas as armas do inventário; clicar numa equipa ela, e
// clicar na que já está equipada a desequipa (reusa o MESMO toggleEquiparItem do Arsenal, incluindo
// o recálculo de vitais que ele já faz) — a arma equipada aparece destacada e é a que o
// ATACAR/ROLAR DANO acima já usa.
export function MapaAtaqueArma({ aoRolar }) {
    const ataqueCtx = useAtaqueForm();
    const arsenalCtx = useArsenalForm();
    if (!ataqueCtx) return null;
    const { armaEquipada, podeRolarDano, ignorarTravaAcerto, setIgnorarTravaAcerto, rolarDano, dummieAlvo, minhaFicha } = ataqueCtx;
    const podeAtacar = podeRolarDano || ignorarTravaAcerto;
    const armas = (minhaFicha?.inventario || []).filter(i => i.tipo === 'arma');
    // Fecha o Livro só se a rolagem aconteceu (alerta de erro ou confirmação cancelada deixam o Livro aberto).
    const rolar = () => { if (rolarDano() !== false && aoRolar) aoRolar(); };

    return (
        <div className="def-box livro-arma">
            <h4 className="livro-arma-titulo">🗡️ Ataque com Arma</h4>
            <p className="livro-arma-info">
                {armaEquipada ? `Arma equipada: ${armaEquipada.nome}` : 'Nenhuma arma equipada — role assim mesmo com a config de dano atual da aba Ataque.'}
            </p>

            {arsenalCtx && armas.length > 0 && (
                <div className="mapa-tecnicas-grade livro-arma-lista">
                    {armas.map(arma => (
                        <button
                            key={arma.id}
                            className={`btn-neon mapa-tecnica-chip${arma.equipado ? ' mapa-tecnica-chip--ligada' : ''}`}
                            onClick={() => arsenalCtx.toggleEquiparItem(arma.id)}
                            aria-pressed={!!arma.equipado}
                            title={arma.equipado ? 'Arma equipada — clique pra desequipar' : 'Clique pra equipar (desequipa a arma atual)'}
                        >
                            {arma.equipado ? '🗡️' : '⚪'} {arma.nome || 'Sem nome'}
                        </button>
                    ))}
                </div>
            )}

            <label className="livro-arma-ignorar" title="Use pra Saving Throws ou ataques em Área, que não passam pela trava de Acerto">
                <input type="checkbox" checked={ignorarTravaAcerto} onChange={e => setIgnorarTravaAcerto(e.target.checked)} />
                Ignorar Trava de Acerto (P/ Saving Throws ou Área)
            </label>

            <button className="livro-arma-rolar" onClick={rolar} disabled={!podeAtacar}>
                {dummieAlvo ? (podeAtacar ? `⚔️ ATACAR ${String(dummieAlvo.nome || 'alvo').toUpperCase()}` : 'ACERTO NECESSÁRIO PRIMEIRO') : '⚔️ ROLAR DANO'}
            </button>
            {!podeAtacar && (
                <p className="livro-arma-aviso">
                    Role um Acerto contra este alvo na aba Acerto primeiro, ou marque "Ignorar Trava" acima.
                </p>
            )}
        </div>
    );
}

const MAPA_TECNICAS_CATEGORIAS = {
    forma: { label: '🎭 Formas', cor: '#aa00ff' },
    habilidade: { label: '🗡️ Habilidades', cor: '#ff8800' },
    poder: { label: '✨ Poderes', cor: '#00ffcc' },
};
const MAPA_TECNICAS_SEM_PASTA = 'Sem Pasta';

// 🔥 Ativa/desativa Poderes/Formas/Habilidades criadas no Grimório direto do Mapa, sem precisar
// sair do combate — reusa o MESMO togglePoder (PoderesFormContext.jsx) que a aba Poderes/Grimório
// usa (mesmo p.ativa, mesmo recálculo de vitais ao ligar/desligar uma Forma). Não dispara dano
// sozinha (o Poder/Forma entra na conta do rolarDano/Modo Deus normalmente, do jeito que já
// funciona hoje) — é só o interruptor rápido pra ligar a técnica ANTES de atacar.
//
// 🗂️ Organização: agrupa primeiro por CATEGORIA (Formas/Habilidades/Poderes — as 3 abas do
// Grimório) e, dentro de cada uma, por PASTA (p.pasta, mesmo campo que a aba Poderes usa — ver
// PoderesFormContext.jsx). Formas sempre agrupam por pasta (mesmo comportamento de sempre na aba
// Poderes); Habilidades/Poderes só agrupam se algum item da categoria já tiver uma pasta
// atribuída, senão ficam em lista simples — pedido do usuário pra organizar a lista longa de
// técnicas que aparecia toda achatada no Mapa.
//
// 🔥 "Pastas fechadas" vive no Zustand (pastasFechadasMapaTecnicas/setPastasFechadasMapaTecnicas
// em useStore.js), NÃO num useState local, de propósito: este painel (e os outros do Mapa —
// MapaAtaqueArma etc.) só fica montado enquanto `abaAtiva === 'aba-mapa'` (ver MapaPanel.jsx >
// mapaEmFoco), pra não rodar os providers de Ataque/Poderes/Arsenal/Elementos em paralelo o tempo
// todo. Isso significa que trocar de aba e voltar pro Mapa DESMONTA e REMONTA este componente —
// um `useState({})` comum perderia todo o "fechei essas pastas" nesse meio-tempo (bug relatado:
// fechar pastas, trocar de aba, voltar ao Mapa e ver tudo aberto de novo). O Zustand é um
// singleton fora da árvore de React, então sobrevive ao desmonte/remonte por construção.
// Acima disso as pastas nascem FECHADAS (quem tem muitas técnicas abre só a que precisa).
const MAPA_TECNICAS_MUITAS = 12;

export function MapaTecnicasRapidas() {
    const poderesCtx = usePoderesForm();
    const pastasFechadas = useStore(s => s.pastasFechadasMapaTecnicas);
    const setPastasFechadasMapaTecnicas = useStore(s => s.setPastasFechadasMapaTecnicas);
    const [busca, setBusca] = useState('');
    const [soLigadas, setSoLigadas] = useState(false);
    const gastarAcao = useGastarAcao();
    if (!poderesCtx) return null;
    const { minhaFicha, togglePoder, mudarEstagioPoder } = poderesCtx;
    const poderes = minhaFicha?.poderes || [];
    // ⏱️ Ligar a técnica cobra a Ação que ela custa (core/acoesTecnica.js); desligar não cobra nada.
    const alternarTecnica = (p) => { if (!p.ativa && !gastarAcao(p)) return; togglePoder(p.id); };
    const termo = busca.trim().toLowerCase();
    // 🔍 Busca por nome (e pasta): enquanto há busca, as pastas com resultado ficam abertas.
    // ★ "Só ligadas" filtra a lista (em vez de repetir as ligadas num bloco à parte): continuam nas suas pastas.
    const baseLista = soLigadas ? poderes.filter(p => p && p.ativa) : poderes;
    const filtrados = termo ? baseLista.filter(p => p && (`${p.nome || ''} ${p.pasta || ''}`).toLowerCase().includes(termo)) : baseLista;
    const ligadasTotal = poderes.filter(p => p && p.ativa).length;
    const padraoFechada = poderes.length > MAPA_TECNICAS_MUITAS;
    // Durante a busca / "só ligadas" as pastas ficam abertas à força: o clique no cabeçalho não pode mexer no estado salvo.
    const forcaAberta = !!termo || soLigadas;
    const fechadaSalva = (chave) => (chave in pastasFechadas ? !!pastasFechadas[chave] : padraoFechada);
    const estaFechada = (chave) => (forcaAberta ? false : fechadaSalva(chave));
    const toggleFechada = (chave) => { if (forcaAberta) return; setPastasFechadasMapaTecnicas({ ...pastasFechadas, [chave]: !estaFechada(chave) }); };
    // Categorias (Formas/Habilidades/Poderes) nascem abertas; recolhê-las esconde todas as pastas e técnicas dela.
    const categoriaFechada = (cat) => (forcaAberta ? false : !!pastasFechadas[`categoria::${cat}`]);
    const toggleCategoria = (cat) => { if (forcaAberta) return; setPastasFechadasMapaTecnicas({ ...pastasFechadas, [`categoria::${cat}`]: !categoriaFechada(cat) }); };
    // Todas as chaves de pasta (inclui pastas-mãe e subpastas, core/pastas.js).
    const todasChaves = [];
    Object.keys(MAPA_TECNICAS_CATEGORIAS).forEach(cat => {
        const doCat = poderes.filter(p => p && ((p.categoria || 'poder').toLowerCase() === cat));
        listarCaminhosPastas(doCat).forEach(caminho => { todasChaves.push(`${cat}::${caminho}`); });
        if (doCat.some(p => segmentosPasta(p.pasta).length === 0)) todasChaves.push(`${cat}::${MAPA_TECNICAS_SEM_PASTA}`);
    });
    // Um botão só: se existe alguma pasta aberta ele recolhe tudo; senão, expande tudo.
    const algumaAberta = todasChaves.some(c => !fechadaSalva(c));
    const alternarTodas = () => {
        // Mantém o estado salvo de outras listas (ex.: grupos das Técnicas Elementais).
        const todas = { ...pastasFechadas };
        todasChaves.forEach(c => { todas[c] = algumaAberta; });
        setPastasFechadasMapaTecnicas(todas);
    };

    if (poderes.length === 0) {
        return (
            <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #aa00ff' }}>
                <h4 style={{ color: '#aa00ff', margin: 0 }}>📖 Minhas Técnicas (Grimório)</h4>
                <p style={{ color: '#888', fontSize: '0.8em', margin: '8px 0 0 0' }}>
                    Nenhuma técnica criada ainda. Vá no <strong>Grimório</strong> (Livro dos Poderes) pra criar Poderes/Formas/Habilidades e ativá-las direto por aqui.
                </p>
            </div>
        );
    }

    // 🪜 Técnica com Estágios (core/estagios.js): o chip ganha o seletor − 3º Portão + ao lado.
    const renderChip = (p) => (temEstagios(p) ? (
        <div key={p.id} className="mapa-tecnica-estagio">
            {renderBotao(p)}
            <EstagioControle poder={p} onMudar={mudarEstagioPoder} compacto />
        </div>
    ) : renderBotao(p));

    const renderBotao = (p) => (
        <button
            key={p.id}
            className={`btn-neon mapa-tecnica-chip${p.ativa ? ' mapa-tecnica-chip--ligada' : ''}`}
            onClick={() => alternarTecnica(p)}
            title={p.descricao || p.nome || ''}
            style={{
                margin: 0, padding: '6px 14px', fontWeight: 'bold', borderColor: '#aa00ff',
                background: p.ativa ? 'rgba(170,0,255,0.3)' : 'transparent',
                color: p.ativa ? '#fff' : '#aa00ff',
            }}
        >
            {p.ativa ? '★' : '☆'} {p.nome || 'Sem nome'}{tipoAcaoAoLigar(p) ? <span className="mapa-chip-acao"> · {getRotuloAcaoTecnica(tipoAcaoAoLigar(p))}</span> : null}
        </button>
    );

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #aa00ff' }}>
            <h4 style={{ color: '#aa00ff', margin: '0 0 8px 0' }}>📖 Minhas Técnicas (Grimório)</h4>
            {/* 🧭 Organização: busca, recolher/expandir tudo e a faixa das técnicas ligadas agora */}
            <div className="mapa-tecnicas-barra">
                <input
                    type="search" className="input-neon mapa-tecnicas-busca" placeholder="🔍 Buscar técnica ou pasta..."
                    value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar técnica"
                />
                <button
                    type="button" className={`btn-neon mapa-tecnicas-mini${soLigadas ? ' mapa-tecnicas-mini--ativo' : ''}`}
                    onClick={() => setSoLigadas(v => !v)} aria-pressed={soLigadas} title="Mostra só as técnicas ligadas agora (nas suas pastas)"
                >★ Só ligadas ({ligadasTotal})</button>
                <button type="button" className="btn-neon mapa-tecnicas-mini" onClick={alternarTodas} title={algumaAberta ? 'Fecha todas as pastas' : 'Abre todas as pastas'}>
                    {algumaAberta ? '▶ Recolher tudo' : '▼ Expandir tudo'}
                </button>
            </div>
            {(termo || soLigadas) && filtrados.length === 0 && <p className="mapa-tecnicas-vazia">{soLigadas && !termo ? 'Nenhuma técnica ligada.' : 'Nenhuma técnica com esse nome.'}</p>}
            {Object.keys(MAPA_TECNICAS_CATEGORIAS).map(cat => {
                const itensCat = filtrados.filter(p => p && ((p.categoria || 'poder').toLowerCase() === cat));
                if (itensCat.length === 0) return null;
                const info = MAPA_TECNICAS_CATEGORIAS[cat];

                // 🗂️ Pastas aninhadas (core/pastas.js): "Taijutsu/Portões" é a pasta Portões dentro de Taijutsu.
                let arvore = null;
                if (cat === 'forma' || itensCat.some(p => segmentosPasta(p.pasta).length > 0)) {
                    arvore = construirArvorePastas(itensCat);
                }
                const renderPasta = (no, nivel) => {
                    const chave = `${cat}::${no.caminho}`;
                    const fechada = estaFechada(chave);
                    const ligadas = contarNaPasta(no);
                    return (
                        <div key={chave} className={nivel > 0 ? 'mapa-tecnicas-pasta mapa-tecnicas-subpasta' : 'mapa-tecnicas-pasta'}>
                            <button
                                type="button"
                                onClick={() => toggleFechada(chave)}
                                aria-expanded={!fechada}
                                className="mapa-tecnicas-pasta-topo"
                                style={{ color: info.cor }}
                            >
                                <span className="mapa-pasta-seta" aria-hidden="true">{fechada ? '▶' : '▼'}</span> <span className="mapa-pasta-icone" aria-hidden="true">📁</span> <span className="mapa-pasta-nome">{no.nome}</span> <span className="mapa-pasta-total" style={{ opacity: 0.6, fontWeight: 'normal' }}>({no.total})</span>
                                {ligadas > 0 && <span className="mapa-tecnicas-pasta-ligadas"> ★ {ligadas}</span>}
                            </button>
                            {!fechada && (
                                <>
                                    {no.itens.length > 0 && <div className="mapa-tecnicas-grade">{no.itens.map(renderChip)}</div>}
                                    {no.filhos.map(f => renderPasta(f, nivel + 1))}
                                </>
                            )}
                        </div>
                    );
                };

                const catFechada = categoriaFechada(cat);
                return (
                    <div key={cat} style={{ marginTop: 10 }}>
                        <button type="button" className="mapa-tecnicas-categoria" aria-expanded={!catFechada} onClick={() => toggleCategoria(cat)} title={catFechada ? 'Abrir categoria' : 'Recolher categoria'} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px dashed ${info.cor}`, cursor: 'pointer', color: info.cor, fontWeight: 'bold', fontSize: '0.85em', marginBottom: 6, paddingBottom: 4, paddingLeft: 0, paddingRight: 0 }}>
                            <span className="mapa-categoria-seta" aria-hidden="true">{catFechada ? '▶' : '▼'}</span> {info.label} <span className="mapa-categoria-total" style={{ opacity: 0.6, fontWeight: 'normal' }}>({itensCat.length})</span>
                        </button>
                        {!catFechada && (arvore ? (
                            <>
                                {arvore.pastas.map(no => renderPasta(no, 0))}
                                {arvore.semPasta.length > 0 && renderPasta({ nome: MAPA_TECNICAS_SEM_PASTA, caminho: MAPA_TECNICAS_SEM_PASTA, itens: arvore.semPasta, filhos: [], total: arvore.semPasta.length }, 0)}
                            </>
                        ) : (
                            <div className="mapa-tecnicas-grade">
                                {itensCat.map(renderChip)}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

// 🔥 Memoriza/desmemoriza Técnicas Elementais (ficha.ataquesElementais, criadas na página
// "Afinidades & Elementos" do Grimório — ElementosFormContext.jsx) direto do Mapa. Mesma lógica
// da terceira categoria de técnicas que faltava aqui (Formas/Poderes/Habilidades já cobertos por
// MapaTecnicasRapidas acima — Elementais vivem num array à parte, ataquesElementais, com seu
// próprio toggle). "Conjurar" uma magia elemental nesta ficha NÃO tem um roll próprio (ver
// conjurarMagia em ElementosFormContext.jsx — hoje só existe pra apontar pro Ataque) — o fluxo
// real do jogo é MEMORIZAR (equipar) a magia aqui e depois rolar o dano normalmente em ⚔️ Ataque
// com Arma acima, que já entra em conta com toda magia elemental equipada. Agrupado por elemento
// (Fogo/Água/Vento/...), reusando os mesmos emojis/cores já usados na aba Afinidades & Elementos.
export function MapaMagiasElementais() {
    const elemCtx = useElementosForm();
    const pastasFechadas = useStore(s => s.pastasFechadasMapaTecnicas);
    const setPastasFechadasMapaTecnicas = useStore(s => s.setPastasFechadasMapaTecnicas);
    const [busca, setBusca] = useState('');
    const [soLigadas, setSoLigadas] = useState(false);
    if (!elemCtx) return null;
    const { minhaFicha, toggleEquiparElem } = elemCtx;
    const magias = (minhaFicha?.ataquesElementais || []).filter(Boolean);

    if (magias.length === 0) {
        return (
            <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #00ffcc' }}>
                <h4 style={{ color: '#00ffcc', margin: 0 }}>🌪️ Técnicas Elementais</h4>
                <p style={{ color: '#888', fontSize: '0.8em', margin: '8px 0 0 0' }}>
                    Nenhuma magia elemental criada ainda. Vá em <strong>Afinidades & Elementos</strong> (Grimório) pra escrever uma e memorizá-la direto por aqui.
                </p>
            </div>
        );
    }

    // 🧭 Mesma organização das Técnicas do Grimório: busca, "só ligadas", um botão recolher/expandir
    // e um grupo recolhível por elemento (estado salvo em pastasFechadasMapaTecnicas, chave elemental::<Elemento>).
    const termo = busca.trim().toLowerCase();
    const ligadasTotal = magias.filter(m => m.equipado).length;
    const filtradas = magias.filter(m => (!soLigadas || m.equipado) && (!termo || `${m.nome || ''} ${m.elemento || ''}`.toLowerCase().includes(termo)));
    const grupos = {};
    filtradas.forEach(m => {
        const nome = m.elemento || 'Neutro';
        if (!grupos[nome]) grupos[nome] = [];
        grupos[nome].push(m);
    });
    const nomesElementos = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const chaveGrupo = (nomeEl) => `elemental::${nomeEl}`;
    const padraoFechada = magias.length > MAPA_TECNICAS_MUITAS;
    const forcaAberta = !!termo || soLigadas;
    const fechadaSalva = (chave) => (chave in pastasFechadas ? !!pastasFechadas[chave] : padraoFechada);
    const estaFechada = (chave) => (forcaAberta ? false : fechadaSalva(chave));
    const todasChaves = Array.from(new Set(magias.map(m => chaveGrupo(m.elemento || 'Neutro'))));
    const algumaAberta = todasChaves.some(c => !fechadaSalva(c));
    const alternarTodas = () => {
        const novo = { ...pastasFechadas };
        todasChaves.forEach(c => { novo[c] = algumaAberta; });
        setPastasFechadasMapaTecnicas(novo);
    };
    const toggleGrupo = (chave) => { if (forcaAberta) return; setPastasFechadasMapaTecnicas({ ...pastasFechadas, [chave]: !estaFechada(chave) }); };

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #00ffcc' }}>
            <h4 style={{ color: '#00ffcc', margin: '0 0 8px 0' }}>🌪️ Técnicas Elementais</h4>
            <div className="mapa-tecnicas-barra">
                <input
                    type="search" className="input-neon mapa-tecnicas-busca" placeholder="🔍 Buscar magia ou elemento..."
                    value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar técnica elemental"
                />
                <button
                    type="button" className={`btn-neon mapa-tecnicas-mini${soLigadas ? ' mapa-tecnicas-mini--ativo' : ''}`}
                    onClick={() => setSoLigadas(v => !v)} aria-pressed={soLigadas} title="Mostra só as magias memorizadas"
                >★ Só ligadas ({ligadasTotal})</button>
                <button type="button" className="btn-neon mapa-tecnicas-mini" onClick={alternarTodas} title={algumaAberta ? 'Fecha todos os grupos' : 'Abre todos os grupos'}>
                    {algumaAberta ? '▶ Recolher tudo' : '▼ Expandir tudo'}
                </button>
            </div>
            {(termo || soLigadas) && filtradas.length === 0 && <p className="mapa-tecnicas-vazia">{soLigadas && !termo ? 'Nenhuma magia memorizada.' : 'Nenhuma magia com esse nome.'}</p>}
            {nomesElementos.map(nomeEl => {
                const cor = ELEMENTOS_CORES[nomeEl] || '#00ffcc';
                const emoji = ELEMENTOS_EMOJIS[nomeEl] || '🌪️';
                const chave = chaveGrupo(nomeEl);
                const fechada = estaFechada(chave);
                const ligadas = grupos[nomeEl].filter(m => m.equipado).length;
                return (
                    <div key={nomeEl} className="mapa-tecnicas-pasta">
                        <button type="button" className="mapa-tecnicas-pasta-topo mapa-tecnicas-pasta-topo--elemento" aria-expanded={!fechada} style={{ color: cor, '--cor-elemento': cor }} onClick={() => toggleGrupo(chave)}>
                            <span className="mapa-pasta-seta" aria-hidden="true">{fechada ? '▶' : '▼'}</span> <span className="mapa-pasta-icone" aria-hidden="true">{emoji}</span> <span className="mapa-pasta-nome">{nomeEl}</span> <span className="mapa-pasta-total" style={{ opacity: 0.6, fontWeight: 'normal' }}>({grupos[nomeEl].length})</span>
                            {ligadas > 0 && <span className="mapa-tecnicas-pasta-ligadas"> ★ {ligadas}</span>}
                        </button>
                        {!fechada && (
                            <div className="mapa-tecnicas-grade">
                                {grupos[nomeEl].map(m => (
                                    <button
                                        key={m.id}
                                        className={`btn-neon mapa-tecnica-chip mapa-tecnica-chip--elemento${m.equipado ? ' mapa-tecnica-chip--ligada' : ''}`}
                                        onClick={() => toggleEquiparElem(m.id)}
                                        title={m.descricao || m.nome || ''}
                                        style={{
                                            margin: 0, padding: '6px 14px', fontWeight: 'bold', borderColor: cor, '--cor-elemento': cor,
                                            background: m.equipado ? `${cor}40` : 'transparent',
                                            color: m.equipado ? '#fff' : cor,
                                        }}
                                    >
                                        {m.equipado ? '★' : '☆'} {m.nome || 'Sem nome'}{m.tipoAcao ? <span className="mapa-chip-acao"> · {getRotuloAcaoTecnica(m.tipoAcao)}</span> : null}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// 🔥 Barrinha de vida/energia da moldura de combate — desenha o quão cheio "atual" está em
// relação ao teto EXIBIDO do vital (calcVitalScale/calcularBarrasVida, core/vitals.js — a mesma
// "única fonte de verdade" que a própria Ficha Definitiva e a Regeneração automática já usam,
// combinada com calcularFatorMultiplicadorForca de core/poder.js — ver comentário mais abaixo, em
// MapaHologramaAcao, sobre por que esse fator entra aqui também). O número de Máximo em si não é
// mostrado ao lado do Atual (só a barra) por pedido explícito do usuário — mostrar os dois juntos
// gerava confusão. Pra HP (perigo=true) a cor muda pra amarelo/vermelho conforme a vida cai, já
// que é o recurso que mais importa saber "quão perto da morte" está.
//
// ✅ RESOLVIDO (era um "residual conhecido" nesta mesma investigação): a Ficha Definitiva (Ficha
// Def/Marcados.jsx > handleRegenerarTudo/LinhaVital) aplica, por cima do teto de cada vital, um
// fator extra de Ascensão específico daquele vital (fatoresVitaisAtual/calcularFatorCategoria) —
// um bônus praticamente sempre >1 pra qualquer personagem com pontos de Ascensão naquele vital,
// não um caso raro. Esse fator não existia aqui, então o MESMO personagem podia mostrar um Máximo
// diferente na Ficha e no Mapa (pedido do usuário pra corrigir). Uma tentativa anterior de dobrar
// esse fator DENTRO de core/vitals.js > getMaximo/getVitalMax quebrou 11 testes (o fator inflaria
// o teto REAL usado por drenos/clamps/regen em todo o app, não só a exibição) — a correção certa
// foi extrair o cálculo como função pura, SÓ DE EXIBIÇÃO (core/poder.js >
// calcularFatorMultiplicadorForca), e aplicá-la aqui exatamente como a Ficha já fazia, sem tocar
// em core/vitals.js.
function BarraVital({ atual, maximo, cor, perigo = false }) {
    const atualSeguro = Number(atual) || 0;
    const maximoSeguro = Number(maximo) || 0;
    const pct = maximoSeguro > 0 ? Math.max(0, Math.min(100, (atualSeguro / maximoSeguro) * 100)) : (atualSeguro > 0 ? 100 : 0);
    let corBarra = cor;
    if (perigo) { if (pct <= 20) corBarra = '#ff3030'; else if (pct <= 50) corBarra = '#ffcc00'; }
    return (
        <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 3 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: corBarra, borderRadius: 3, transition: 'width 0.6s ease, background 0.3s ease', boxShadow: `0 0 6px ${corBarra}` }} />
        </div>
    );
}

// ⚡ Linha de Poder da moldura: o Mestre (e o dono do personagem) vê o número exato; os outros jogadores
// veem só a ESTIMATIVA ("entre X e Y"), que a Ocultação do alvo alarga e a Percepção de quem olha
// estreita (core/percepcaoPoder.js).
function MoldPoderLinha({ exato, poderExato, estimativa }) {
    const precisao = exato ? '' : rotuloPrecisaoPoder(estimativa);
    return (
        <div className="moldura-poder-linha">
            <span className="moldura-poder-rotulo">{exato ? '⚡ PODER' : '⚡ PODER ESTIMADO'}</span>
            <span className="moldura-poder-valor">
                {exato
                    ? (poderExato === null ? '—' : formatarPoderCosmico(poderExato))
                    : descreverEstimativaPoder(estimativa, formatarPoderCosmico)}
                {precisao && <small className="moldura-poder-precisao" title="O quanto você consegue perceber do Poder deste personagem">{precisao}</small>}
            </span>
        </div>
    );
}

// 🧭 Situação extra que só o Mestre (e o dono) vê: Fadiga, Supressão e Ocultação do Poder.
function MoldSituacao({ ficha, supressao }) {
    const fadiga = calcularFadigaAtual(ficha);
    const teto = getTetoOcultacaoPoder(ficha);
    const ocultacao = getOcultacaoPoder(ficha);
    return (
        <div className="moldura-situacao">
            <span title="Fadiga de combate acumulada">😮‍💨 Fadiga {Math.round(fadiga * 10) / 10}%</span>
            <span title="Poder em uso (Restringir Poder): reduz Fadiga, não esconde o Poder de ninguém">🔇 Poder em uso {Math.round(supressao * 10) / 10}%</span>
            {teto > 0 && <span title="Ocultar Presença: o quanto os outros jogadores deixam de sentir deste Poder">🕶️ Presença oculta {Math.round(ocultacao)}%</span>}
        </div>
    );
}

export function MapaHologramaAcao() {
    const ctx = useMapaForm();
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);
    const alvoSelecionado = useStore(s => s.alvoSelecionado);
    const setAlvoSelecionado = useStore(s => s.setAlvoSelecionado);
    if (!ctx) return null;
    const { ordemIniciativa, feedCombate, feedIndexTurnoAtual, jogadorDaVez, jogadores, overridesCompendio, getAvatarInfo, fmt, meuNome, minhaFicha, isMestre, inspecao, limparInspecao, removerTokenDoMapa } = ctx;

    const feedSeguro = feedCombate || [];
    const ordemSegura = ordemIniciativa || [];
    const emCombate = ordemSegura.length > 0;

    const acaoNovaNoTurno = feedSeguro.length > feedIndexTurnoAtual ? feedSeguro[feedSeguro.length - 1] : null;
    const acaoGeralForaDeCombate = feedSeguro.length > 0 ? feedSeguro[feedSeguro.length - 1] : null;
    // 👁️ Inspeção (clique num token ou na Ordem de Turno): a moldura mostra o resumo do personagem
    // escolhido no lugar da ação do combate, até fecharem (✖) ou clicarem em outro.
    const inspecionando = !!inspecao;
    // 🛡️ Regra de PvP: jogador só mira outro jogador durante um combate (core/alvoCombate.js).
    const bloqueioMirar = (inspecionando && !inspecao.isDummie)
        ? motivoBloqueioAlvo({ fichaAtor: minhaFicha, atorEhMestre: isMestre, alvo: { isPersonagem: true, tipoPersonagem: getTipoPersonagem(inspecao.ficha), ficha: inspecao.ficha } })
        : null;
    const acaoExibir = inspecionando ? null : (emCombate ? acaoNovaNoTurno : acaoGeralForaDeCombate);

    if (!inspecionando && !emCombate && !acaoExibir) {
        return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontStyle: 'italic', border: '2px dashed #333', borderRadius: 8 }}>O campo de batalha aguarda...</div>;
    }

    let nomeBase = inspecionando ? inspecao.nome : (jogadorDaVez ? jogadorDaVez.nome : (acaoExibir ? acaoExibir.nome : ''));
    let fichaBase = inspecionando ? inspecao.ficha : (jogadorDaVez ? jogadorDaVez.ficha : (acaoExibir ? jogadores[acaoExibir.nome] : null));
    let infoBase = getAvatarInfo(fichaBase);
    const ehDummieBase = inspecionando ? inspecao.isDummie : !!(jogadorDaVez && jogadorDaVez.isDummie);
    const idBase = inspecionando ? inspecao.id : (jogadorDaVez ? jogadorDaVez.id : nomeBase);
    // Quem vê tudo exato: o Mestre e o dono do personagem. Os outros jogadores só veem estimativa.
    const verTudo = !!isMestre || (!ehDummieBase && nomeBase === meuNome);

    // 🔥 Poder Atual (o mesmo número do Scouter na ficha), pra saber a força do alvo sem sair do mapa
    // Nota: sem useMemo de propósito — este ponto do componente já vem depois de dois `return`
    // condicionais acima, então um hook aqui violaria a Regra dos Hooks (nº de hooks variável entre renders).
    const poderCalculadoBase = (fichaBase && !ehDummieBase) ? calcularPoderAtual(fichaBase, divisorPoderMesa) : null;
    // Entidades do Mapa (dummies) não têm ficha: o Poder é o campo poderCalculado definido pelo Mestre.
    const poderDummieBase = (fichaBase && ehDummieBase) ? getPoderDummie(fichaBase) : null;
    const poderAtualBase = ehDummieBase ? poderDummieBase : (poderCalculadoBase ? poderCalculadoBase.poderGlobal : 0);
    const estimativaPoderBase = (!verTudo && fichaBase)
        ? estimarPoderDeEntidade({ isDummie: ehDummieBase, ficha: fichaBase, id: idBase, nome: nomeBase }, minhaFicha, divisorPoderMesa)
        : null;
    // HP Oculto do token vale também aqui: quem não é Mestre não vê a Vida/Energias dele.
    const vitaisOcultos = !!(ehDummieBase && !isMestre && fichaBase && fichaBase.visibilidadeHp && fichaBase.visibilidadeHp !== 'todos');
    // Jogador clicando em OUTRO personagem recebe a visão resumida (estimativa + condição), sem números.
    const resumoReduzido = (inspecionando && !verTudo) || vitaisOcultos;

    // 🔥 Teto EXIBIDO de cada vital pras barrinhas de recurso — getVitalMxDisplay (core/vitals.js)
    // é a mesma "única fonte de verdade" que a própria Ficha Definitiva usa pra mostrar o Máximo
    // na tela de Status e que a Regeneração automática de turno usa como teto. Usar aqui o
    // getMaximo() bruto (sem a escala de notação nem o fator de Ascensão por vital) fazia a barra
    // comparar "atual" (guardado já nessa escala/fator) contra um teto em outra unidade — o mesmo
    // vazamento de escala já documentado no topo de core/vitals.js.
    //
    // 🩹 SINCRONIA COM A FICHA (pedido do usuário — o mesmo personagem mostrava Máximos diferentes
    // na Ficha Definitiva e no Mapa): a Ficha (Marcados.jsx > LinhaVital) multiplica o teto de cada
    // vital pelo "Multiplicador de Força" daquele vital (Ascensão/Prestígio-overflow individual,
    // ver core/poder.js > calcularFatorMultiplicadorForca) ANTES de decidir escala/nº de barras —
    // esta tela não aplicava esse fator, então o mesmo personagem podia mostrar Máximos diferentes
    // em cada tela. Aplicado aqui do mesmo jeito (só de EXIBIÇÃO, não entra em getMaximo/
    // getVitalMax — ver o comentário de calcularFatorMultiplicadorForca pro motivo).
    const fatorVida = fichaBase ? calcularFatorMultiplicadorForca(fichaBase, 'vida') : 1;

    // 🩸 MÚLTIPLAS BARRAS DE VIDA (pedido do usuário, mesma regra da Ficha — ver core/vitals.js >
    // calcularBarrasVida/calcularBarrasVidaDummy): também vale pros dummies/NPCs do Mapa, que não
    // têm ficha.vida (usam hpMax/hpAtual planos, sem Multiplicador de Força — daí o branch por
    // isDummie abaixo não precisar de fatorVida).
    const vidaInfo = fichaBase
        ? (ehDummieBase
            ? calcularBarrasVidaDummy(fichaBase.hpMax, fichaBase.hpAtual)
            : calcularBarrasVida(getVitalMax('vida', fichaBase) * fatorVida, 'vida', fichaBase.vida?.atual, getVitalMaxEstavel('vida', fichaBase) * fatorVida))
        : { atual: 0, totalMax: 0, barras: [] };

    // 🔥 Reformulação de Vida/Energias: divide por FATOR_EXIBICAO_VITAIS só aqui, na EXIBIÇÃO —
    // getVitalMax/getVitalMaxEstavel/calcVitalScale continuam intocados (mesma escala bruta de
    // sempre, usada pelo Poder Calculado e pelo custo/dano em combate).
    const maximoExibidoComFator = (key) => {
        if (!fichaBase) return 0;
        const fator = calcularFatorMultiplicadorForca(fichaBase, key);
        const rawMx = getVitalMax(key, fichaBase) * fator;
        const rawMxEstavel = getVitalMaxEstavel(key, fichaBase) * fator;
        return calcVitalScale(rawMx, key, rawMxEstavel).mxDisplay / FATOR_EXIBICAO_VITAIS;
    };
    const manaMaxima = maximoExibidoComFator('mana');
    const auraMaxima = maximoExibidoComFator('aura');
    const chakraMaximo = maximoExibidoComFator('chakra');
    const corpoMaximo = maximoExibidoComFator('corpo');

    let classId = fichaBase?.bio?.classe;
    if ((classId === 'pretender' || classId === 'alterego') && fichaBase?.bio?.subClasse) classId = fichaBase?.bio?.subClasse;
    let mesaBase = fichaBase?.bio?.mesa || 'presente';
    
    const isGrand = classId && overridesCompendio?.grands?.[`${classId}_${mesaBase}`] === nomeBase;
    const listaCands = overridesCompendio?.grands?.[`${classId}_${mesaBase}_candidatos`] || [];
    const isCandidato = classId && !isGrand && listaCands.includes(nomeBase);
    const grandIconUrl = overridesCompendio?.grands?.[`${classId}_${mesaBase}_icone`];
    const customClassIcon = classId ? overridesCompendio?.classes?.[classId]?.iconeUrl : null;
    const defaultClassSymbol = getClassIconById(classId);

    let isCritNormal = false, isCritFatal = false, isFalha = false;
    if (acaoExibir && acaoExibir.rolagem && (acaoExibir.tipo === 'acerto' || acaoExibir.tipo === 'dano')) {
        let maxDado = 0;
        let regexStrong = /<strong>(\d+)<\/strong>/g;
        let match;
        while ((match = regexStrong.exec(acaoExibir.rolagem)) !== null) {
            let v = parseInt(match[1]);
            if (v > maxDado) maxDado = v;
        }
        if (maxDado === 0) {
            let regexArr = /\[(.*?)\]/;
            let mArr = regexArr.exec(acaoExibir.rolagem);
            if (mArr) {
                let clean = mArr[1].replace(/<[^>]*>?/gm, ''); 
                let nums = clean.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
                if (nums.length > 0) maxDado = Math.max(...nums);
            }
        }
        const acCfg = fichaBase?.ataqueConfig || minhaFicha?.ataqueConfig || {};
        const cNMin = acCfg.criticoNormalMin || 16, cNMax = acCfg.criticoNormalMax || 18;
        const cFMin = acCfg.criticoFatalMin || 19, cFMax = acCfg.criticoFatalMax || 20;
        
        if (maxDado >= cFMin && maxDado <= cFMax) isCritFatal = true;
        else if (maxDado >= cNMin && maxDado <= cNMax) isCritNormal = true;
        else if (maxDado === 1) isFalha = true;

        if (acaoExibir.tipo === 'dano') {
            if (acaoExibir.armaStr?.includes('FATAL')) { isCritFatal = true; isCritNormal = false; }
            else if (acaoExibir.armaStr?.includes('CRÍTICO')) { isCritNormal = true; isCritFatal = false; }
        }
    }

    const isForaDeCombate = acaoExibir && emCombate && (!ordemSegura.find(j => j.nome === acaoExibir.nome));
    const isForaDeTurno = acaoExibir && emCombate && !isForaDeCombate && acaoExibir.nome !== nomeBase;

    let corImpacto = '#333', corHeader = '#00ffcc', corTextoHeader = '#000', tituloImpacto = 'AÇÃO', valorImpacto = 0;
    if (acaoExibir) {
        switch (acaoExibir.tipo) {
            case 'dano': corImpacto = '#ff003c'; tituloImpacto = 'DANO'; valorImpacto = acaoExibir.dano; break;
            case 'acerto': corImpacto = '#f90'; tituloImpacto = 'ACERTO'; valorImpacto = acaoExibir.valorOculto && acaoExibir.acertoTotal === undefined ? '?' : acaoExibir.acertoTotal; break;
            case 'evasiva': corImpacto = '#0088ff'; tituloImpacto = 'ESQUIVA'; valorImpacto = acaoExibir.total; break;
            case 'resistencia': corImpacto = '#ccc'; tituloImpacto = 'BLOQUEIO'; valorImpacto = acaoExibir.total; break;
            case 'escudo': corImpacto = '#f0f'; tituloImpacto = 'ESCUDO'; valorImpacto = acaoExibir.escudoReduzido; break;
            case 'sistema': corImpacto = '#ffcc00'; tituloImpacto = 'AVISO DO SISTEMA'; valorImpacto = 0; break;
            default: break;
        }
    }

    if (isCritFatal) { corImpacto = '#ff003c'; corHeader = '#ff003c'; corTextoHeader = '#fff'; tituloImpacto = '🔥 CRÍTICO FATAL 🔥'; }
    else if (isCritNormal) { corImpacto = '#ffcc00'; corHeader = '#ffcc00'; corTextoHeader = '#000'; tituloImpacto = '⚡ CRÍTICO NORMAL ⚡'; }
    else if (isFalha) { corImpacto = '#660000'; corHeader = '#660000'; corTextoHeader = '#ff003c'; tituloImpacto = '☠️ FALHA CRÍTICA ☠️'; }
    else if (acaoExibir) {
        corHeader = corImpacto; corTextoHeader = '#000';
        if (acaoExibir.tipo === 'sistema' && String(acaoExibir.texto || '').includes('É a vez de')) {
            tituloImpacto = `⚡ TURNO DE ${nomeBase} ⚡`;
            corHeader = '#00ffcc';
            corImpacto = '#00ffcc';
        } else if (acaoExibir.tipo === 'sistema') {
            tituloImpacto = 'AVISO DO SISTEMA';
        } else if (jogadorDaVez && !isForaDeTurno && !isForaDeCombate) {
            tituloImpacto = `TURNO DE ${nomeBase}`;
        } else {
            tituloImpacto = 'AÇÃO LIVRE';
        }
    } else {
        tituloImpacto = `⚡ TURNO DE ${nomeBase} ⚡`;
    }
    if (inspecionando) { corImpacto = '#00ffcc'; corHeader = '#00ffcc'; corTextoHeader = '#000'; tituloImpacto = '👁️ RESUMO'; }

    const fracaoVida = !fichaBase || vitaisOcultos ? null
        : (ehDummieBase
            ? (Number(fichaBase.hpMax) > 0 ? (Number(fichaBase.hpAtual) || 0) / Number(fichaBase.hpMax) : null)
            : (vidaInfo.totalMax > 0 ? vidaInfo.atual / vidaInfo.totalMax : null));
    const condicaoVida = descreverCondicaoVida(fracaoVida);

    return (
        <>
            {/* 🔥 A moldura pulsa ao chegar uma ação nova — o key={feedSeguro.length} força o
                React a remontar esta div a cada item novo no feed, o que reinicia a animação
                CSS do zero (o mesmo truque de "resetar com key" usado pra qualquer elemento,
                não só itens de lista). Sem isso a moldura só troca o número na hora, estática. */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes hologramaImpacto {
                    0% { transform: scale(1.035); filter: brightness(1.6); }
                    100% { transform: scale(1); filter: brightness(1); }
                }
                .holograma-impacto {
                    animation: hologramaImpacto 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                }
            `}} />
            <div key={feedSeguro.length} className="def-box holograma-impacto" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: isGrand ? `3px solid #ffcc00` : (isCandidato ? `2px solid #00ccff` : `2px solid ${corImpacto}`), boxShadow: isGrand ? `0 0 30px rgba(255,0,60,0.6), inset 0 0 20px rgba(255,204,0,0.3)` : (isCandidato ? `0 0 20px rgba(0,204,255,0.4)` : `0 0 20px ${corImpacto}40`) }}>
            <div style={{ background: corHeader, color: corTextoHeader, padding: '10px', textAlign: 'center', fontWeight: '900', letterSpacing: 2, fontSize: '1.2em', textTransform: 'uppercase', position: 'relative' }}>
                {tituloImpacto}
                {inspecionando && !inspecao.isDummie && (isMestre || inspecao.id === meuNome) && (
                    <button type="button" className="moldura-remover-token" onClick={() => removerTokenDoMapa(inspecao.id)} title={inspecao.id === meuNome ? 'Retirar o seu personagem do Mapa' : 'Remover este personagem do Mapa'}>
                        {inspecao.id === meuNome ? '🚪 Sair do Mapa' : '🗑️ Remover do Mapa'}
                    </button>
                )}
                {/* 🎯 Mirar neste personagem: vira o alvo dos seus ataques (acerto + dano na ficha dele), como um Dummie */}
                {inspecionando && !inspecao.isDummie && inspecao.id !== meuNome && (
                    <button type="button" className="moldura-alvo-token" disabled={!!bloqueioMirar && alvoSelecionado !== idAlvoPersonagem(inspecao.id)} onClick={() => setAlvoSelecionado(alvoSelecionado === idAlvoPersonagem(inspecao.id) ? null : idAlvoPersonagem(inspecao.id))} title={bloqueioMirar || `Escolher este ${inspecao.ficha ? rotuloTipoPersonagem(inspecao.ficha) : 'personagem'} como alvo dos seus ataques`}>
                        {alvoSelecionado === idAlvoPersonagem(inspecao.id) ? '🎯 Alvo (soltar)' : '🎯 Mirar'}
                    </button>
                )}
                {inspecionando && <button type="button" className="moldura-fechar-inspecao" onClick={limparInspecao} title="Voltar à ação do combate" aria-label="Fechar o resumo e voltar à ação do combate">✖</button>}
            </div>
            {acaoExibir?.tipo === 'sistema' && !acaoExibir.texto.includes('É a vez de') ? (
                 <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', background: 'rgba(0,0,0,0.8)' }}>
                    <h2 style={{ color: '#ffcc00', textShadow: '0 0 20px #ffcc00' }}>{acaoExibir.texto}</h2>
                 </div>
            ) : (
                <>
                    <div style={{ flex: '1', minHeight: '250px', backgroundImage: urlSeguraParaCss(infoBase?.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'top center', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', boxShadow: 'inset 0 -100px 50px -20px rgba(0,0,0,0.9)' }}>
                        <div style={{ padding: '20px', zIndex: 2, background: isGrand ? 'linear-gradient(to top, rgba(255,0,60,0.9), transparent)' : (isCandidato ? 'linear-gradient(to top, rgba(0,136,255,0.8), transparent)' : 'none') }}>
                            {isGrand && <div style={{ color: '#ffcc00', fontSize: '0.85em', fontWeight: 'bold', textShadow: '0 0 5px #ff003c', letterSpacing: 2, marginBottom: '5px' }}>👑 GRAND {classId?.toUpperCase()}</div>}
                            {isCandidato && <div style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold', textShadow: '0 0 5px #0088ff', letterSpacing: 2, marginBottom: '5px' }}>🌟 CANDIDATO A {classId?.toUpperCase()}</div>}
                            <h2 style={{ margin: 0, color: '#fff', fontSize: '2em', textShadow: isGrand ? '0 0 15px #ffcc00, 2px 2px 0px #000' : '0 0 10px #000, 2px 2px 0px #000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isGrand && grandIconUrl ? <img src={grandIconUrl} alt="Grand" style={{ height: '1.5em', width: '1.5em', objectFit: 'cover', borderRadius: '50%', border: '2px solid #ffcc00', boxShadow: '0 0 10px #ff003c' }} /> : customClassIcon ? <img src={customClassIcon} alt={classId} style={{ height: '1.2em', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(0,255,204,0.5))' }} /> : defaultClassSymbol ? <span style={{ fontSize: '0.9em', filter: 'drop-shadow(0 0 5px rgba(0,255,204,0.5))' }}>{defaultClassSymbol}</span> : null}
                                {nomeBase}
                            </h2>
                            {infoBase?.forma && <div style={{ color: '#00ffcc', fontSize: '1.2em', fontWeight: 'bold', textShadow: '0 0 5px #000' }}>☄️ {infoBase.forma}</div>}
                        </div>
                    </div>
                    {acaoExibir && (
                        <div style={{ padding: '20px', background: 'rgba(0,0,0,0.85)', textAlign: 'center', borderTop: `1px solid ${corImpacto}` }}>
                            {isForaDeCombate && <div style={{ background: 'rgba(255,204,0,0.1)', color: '#ffcc00', border: '1px solid #ffcc00', padding: 4, fontSize: '0.8em', marginBottom: 10, borderRadius: 4 }}>⚠️ Rolagem Fora de Combate</div>}
                            {isForaDeTurno && <div style={{ background: 'rgba(255,0,60,0.1)', color: '#ff003c', border: '1px solid #ff003c', padding: 4, fontSize: '0.8em', marginBottom: 10, borderRadius: 4 }}>❌ Ação Fora de Turno</div>}
                            
                            <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: '5px', textTransform: 'uppercase' }}>
                                {tituloImpacto} {(!isForaDeCombate && !isForaDeTurno && acaoExibir.tipo !== 'sistema') ? '' : `(${acaoExibir.nome})`}
                            </div>

                            {acaoExibir.tipo === 'sistema' ? (
                                <h2 style={{ margin: '15px 0', color: '#ffcc00', textShadow: '0 0 10px #ffcc00' }}>{acaoExibir.texto}</h2>
                            ) : (
                                <>
                                    <h1 style={{ margin: 0, fontSize: '4em', color: corImpacto, textShadow: `0 0 20px ${corImpacto}` }}>{typeof valorImpacto === 'string' ? valorImpacto : fmt(valorImpacto)}</h1>
                                    {acaoExibir.tipo === 'dano' && acaoExibir.letalidade !== undefined && <div style={{ color: '#ffcc00', fontSize: '1.2em', fontWeight: 'bold', marginTop: '10px', textShadow: '0 0 5px #ffcc00' }}>LETALIDADE: +{acaoExibir.letalidade}</div>}
                                </>
                            )}
                            
                            {acaoExibir.alvosArea && acaoExibir.alvosArea.length > 0 && (
                                <div style={{ marginTop: 15, padding: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 4, borderLeft: `3px solid ${acaoExibir.alvosArea.some(a=>a.acertou) ? '#0f0' : '#f00'}`, textAlign: 'left' }}>
                                    {acaoExibir.areaEf > 0 && <div style={{ color: '#00ccff', fontSize: '0.85em', marginBottom: 6, fontWeight: 'bold', textTransform: 'uppercase' }}>💥 Explosão atingiu {acaoExibir.alvosArea.length} alvo(s):</div>}
                                    {acaoExibir.alvosArea.map((a, i) => (
                                        <div key={i} style={{ color: a.acertou ? '#0f0' : '#f00', fontWeight: 'bold', fontSize: '0.9em', marginBottom: 2 }}>
                                            {a.acertou ? `🎯 Superou ${a.nome} (Def: ${a.defesa})!` : `❌ Falhou vs ${a.nome} (Def: ${a.defesa})!`}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {fichaBase && acaoExibir?.tipo !== 'sistema' && resumoReduzido && (
                        <div style={{ padding: '15px', background: '#050505' }}>
                            <div className="moldura-resumo-jogador">
                                <MoldPoderLinha exato={false} estimativa={estimativaPoderBase} />
                                <div className="moldura-condicao">
                                    <span>🩺 CONDIÇÃO</span>
                                    <strong className={`moldura-condicao-valor moldura-condicao--${condicaoVida.nivel}`}>{condicaoVida.texto}</strong>
                                </div>
                                <p className="moldura-resumo-dica">Você só percebe o que dá para ver de fora. Habilidades e Poderes de Percepção de Poder afinam a estimativa.</p>
                            </div>
                        </div>
                    )}
                    {fichaBase && acaoExibir?.tipo !== 'sistema' && !resumoReduzido && (
                        <div style={{ padding: '15px', background: '#050505' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <MoldPoderLinha exato={verTudo} poderExato={poderAtualBase} estimativa={estimativaPoderBase} />
                                {verTudo && poderCalculadoBase && <MoldSituacao ficha={fichaBase} supressao={poderCalculadoBase.supressao} />}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff4d4d', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>HP</span><span>{fmt(vidaInfo.atual / FATOR_EXIBICAO_VITAIS)}</span></div>
                                    {vidaInfo.barras.length > 1 ? (
                                        // 💔 BREAK BARS: visual novo em pílula com losangos e "quebra" animada (pedido do
                                        // usuário) — componente compartilhado (components/shared/BarrasVida.jsx). Sem
                                        // texto embutido (já mostrado acima) e barra mais fina, pra caber na moldura.
                                        <BarrasVida barras={vidaInfo.barras} cor="#ff4d4d" altura={8} mostrarTexto={false} perigo />
                                    ) : (
                                        <BarraVital atual={vidaInfo.barras[0].atual / FATOR_EXIBICAO_VITAIS} maximo={vidaInfo.barras[0].max / FATOR_EXIBICAO_VITAIS} cor="#ff4d4d" perigo />
                                    )}
                                </div>
                                {!ehDummieBase && (<>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4dffff', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>MP</span><span>{fmt((fichaBase.mana?.atual || 0) / FATOR_EXIBICAO_VITAIS)}</span></div>
                                    <BarraVital atual={(fichaBase.mana?.atual || 0) / FATOR_EXIBICAO_VITAIS} maximo={manaMaxima} cor="#4dffff" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffff4d', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>AU</span><span>{fmt((fichaBase.aura?.atual || 0) / FATOR_EXIBICAO_VITAIS)}</span></div>
                                    <BarraVital atual={(fichaBase.aura?.atual || 0) / FATOR_EXIBICAO_VITAIS} maximo={auraMaxima} cor="#ffff4d" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00ffcc', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>CK</span><span>{fmt((fichaBase.chakra?.atual || 0) / FATOR_EXIBICAO_VITAIS)}</span></div>
                                    <BarraVital atual={(fichaBase.chakra?.atual || 0) / FATOR_EXIBICAO_VITAIS} maximo={chakraMaximo} cor="#00ffcc" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff66ff', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>CP</span><span>{fmt((fichaBase.corpo?.atual || 0) / FATOR_EXIBICAO_VITAIS)}</span></div>
                                    <BarraVital atual={(fichaBase.corpo?.atual || 0) / FATOR_EXIBICAO_VITAIS} maximo={corpoMaximo} cor="#ff66ff" />
                                </div>
                                </>)}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                {ehDummieBase ? (
                                    <div style={{ color: fichaBase.tipoDefesa === 'evasiva' ? '#0088ff' : '#ccc', fontWeight: 'bold', fontSize: '0.9em' }}>🛡️ {fichaBase.tipoDefesa === 'evasiva' ? 'EVA' : 'RES'}: {fichaBase.valorDefesa}</div>
                                ) : (<>
                                    <div style={{ color: '#0088ff', fontWeight: 'bold', fontSize: '0.9em', textShadow: '0 0 5px #0088ff' }}>🛡️ EVA: {calcularCA(fichaBase, 'evasiva')}</div>
                                    <div style={{ color: '#ccc', fontWeight: 'bold', fontSize: '0.9em', textShadow: '0 0 5px #ccc' }}>🛡️ RES: {calcularCA(fichaBase, 'resistencia')}</div>
                                </>)}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
            </div>
        </>
    );
}