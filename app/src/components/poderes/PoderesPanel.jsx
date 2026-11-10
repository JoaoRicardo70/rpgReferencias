import React from 'react';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesAreaCentral } from './PoderesSubComponents'; 

export default function PoderesPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <PoderesFormProvider persistirRascunho>
            <div className={['poderes-panel', className].filter(Boolean).join(' ')} style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                {hasChildren ? children : (
                    <PoderesAreaCentral />
                )}
            </div>
        </PoderesFormProvider>
    );
}