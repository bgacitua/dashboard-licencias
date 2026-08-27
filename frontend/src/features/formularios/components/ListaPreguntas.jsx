import React from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { TIPOS } from './tipos';

function Item({ pregunta, seleccionada, onSeleccionar }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: pregunta.name });

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-2 ${
                seleccionada ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'
            } ${isDragging ? 'opacity-60' : ''}`}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label={`Reordenar ${pregunta.title || pregunta.name}`}
                className="cursor-grab text-gray-400 hover:text-gray-600"
            >
                <GripVertical size={16} />
            </button>
            <button
                type="button"
                onClick={() => onSeleccionar(pregunta.name)}
                className="min-w-0 flex-1 text-left"
            >
                <span className="block truncate text-sm text-gray-900">
                    {pregunta.title || pregunta.name}
                </span>
                <span className="text-xs text-gray-500">
                    {TIPOS[pregunta.type]?.label || pregunta.type}
                    {pregunta.visibleIf ? ' · condicional' : ''}
                </span>
            </button>
        </li>
    );
}

/** Lista ordenable de preguntas de una página. */
export default function ListaPreguntas({ elementos, seleccionada, onSeleccionar, onReordenar }) {
    // Arrastre solo tras 5px: si no, un click de selección se lee como drag.
    const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const alSoltar = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const desde = elementos.findIndex((e) => e.name === active.id);
        const hasta = elementos.findIndex((e) => e.name === over.id);
        onReordenar(arrayMove(elementos, desde, hasta));
    };

    if (elementos.length === 0) {
        return <p className="px-2 py-6 text-sm text-gray-500">Sin preguntas todavía.</p>;
    }

    return (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
            <SortableContext items={elementos.map((e) => e.name)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                    {elementos.map((pregunta) => (
                        <Item
                            key={pregunta.name}
                            pregunta={pregunta}
                            seleccionada={pregunta.name === seleccionada}
                            onSeleccionar={onSeleccionar}
                        />
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    );
}
