import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Html, Sky } from '@react-three/drei';
import * as THREE from 'three';

// 🔥 AGORA ELE RECEBE O "mapUrl" DIRETAMENTE DO PAINEL DO MESTRE
export default function Tabuleiro3D({ mapSize, tokens, moverJogador, mapUrl, inspecionarToken }) {
    const [mapTexture, setMapTexture] = useState(null);
    const [statusMundo, setStatusMundo] = useState('pronto');

    useEffect(() => {
        if (!mapUrl) {
            setMapTexture(null);
            setStatusMundo('pronto');
            return;
        }

        setStatusMundo('carregando');
        const loader = new THREE.TextureLoader();
        // Permite carregar imagens do Discord/Imgur sem bloqueios de segurança (CORS)
        loader.setCrossOrigin('anonymous'); 
        
        loader.load(
            mapUrl,
            (texture) => {
                texture.anisotropy = 16;
                setMapTexture(texture);
                setStatusMundo('pronto');
            },
            undefined,
            (erro) => {
                console.warn("Imagem não encontrada ou link inválido. A usar o chão padrão.");
                setMapTexture(null);
                setStatusMundo('pronto'); 
            }
        );
    }, [mapUrl]);

    const displacementScale = mapTexture ? 2.5 : 0; 

    function handleChaoClick(e) {
        e.stopPropagation();
        const point = e.point;
        const gridX = Math.round(point.x);
        const gridY = Math.round(point.z); 
        moverJogador(gridX, gridY);
    };

    if (statusMundo === 'carregando') {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', border: '2px solid #0088ff' }}>
                <h2 style={{ color: '#00ffcc', textShadow: '0 0 10px #0088ff', animation: 'pulse 1.5s infinite' }}>
                    ⏳ A conjurar o mundo...
                </h2>
            </div>
        );
    }

    return (
        <Canvas camera={{ position: [0, 15, 20], fov: 50 }}>
            <fog attach="fog" args={['#1a1a24', 30, 100]} />
            <Sky distance={450000} sunPosition={[0, -0.5, 0]} inclination={0} azimuth={0.25} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
            <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow onClick={handleChaoClick}>
                <planeGeometry args={[1000, 1000, 128, 128]} />
                {mapTexture ? (
                    <meshStandardMaterial 
                        map={mapTexture} 
                        displacementMap={mapTexture} 
                        displacementScale={displacementScale} 
                        roughness={0.8}
                    />
                ) : (
                    <meshStandardMaterial color="#0b0c10" roughness={0.8} />
                )}
            </mesh>

            <Grid 
                args={[mapSize, mapSize]} 
                position={[0, displacementScale - 0.1, 0]} 
                cellSize={1} 
                cellThickness={1} 
                cellColor="#00ffcc" 
                sectionSize={5} 
                sectionThickness={1.5} 
                sectionColor="#0088ff" 
                fadeDistance={50} 
            />

            {tokens.map((tk, i) => {
                const posX = tk.x;
                const posY = tk.z || 0; 
                const posZ = tk.y;      
                const adjustedAltitude = displacementScale + 0.5 + posY; 

                return (
                    <mesh
                        key={i} position={[posX, adjustedAltitude, posZ]} castShadow
                        onClick={(e) => { if (inspecionarToken) { e.stopPropagation(); inspecionarToken(tk.nome); } }}
                    >
                        <cylinderGeometry args={[0.4, 0.4, 1, 32]} />
                        <meshStandardMaterial color={tk.cor} opacity={0.9} transparent />
                        <Html position={[0, 1, 0]} center style={{ pointerEvents: 'none' }}>
                            <div style={{
                                background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px',
                                color: '#fff', fontSize: '12px', fontWeight: 'bold', border: `1px solid ${tk.cor}`,
                                textShadow: '0 0 5px #000'
                            }}>
                                {tk.nome} {tk.z > 0 ? `☁️ ${tk.z}m` : ''}
                            </div>
                        </Html>
                    </mesh>
                );
            })}
        </Canvas>
    );
}