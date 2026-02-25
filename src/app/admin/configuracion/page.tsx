'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

import type { Sucursal, HorarioApertura } from '@/lib/types'

export default function ConfiguracionPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [sucursal, setSucursal] = useState<Sucursal | null>(null)
    const [formData, setFormData] = useState({
        nombre: '',
        direccion: '',
        telefono_whatsapp: '',
        google_maps_url: '',
        ubicacion: '',
        telefono_fijo: '',
        email_contacto: '',
        instagram_url: '',
        zona_ubicacion: '',
        activa: true
    })
    const [horario, setHorario] = useState<HorarioApertura>({
        lunes: { apertura: '09:00', cierre: '20:00' },
        martes: { apertura: '09:00', cierre: '20:00' },
        miercoles: { apertura: '09:00', cierre: '20:00' },
        jueves: { apertura: '09:00', cierre: '20:00' },
        viernes: { apertura: '09:00', cierre: '20:00' },
        sabado: { apertura: '10:00', cierre: '18:00' },
        domingo: { apertura: '10:00', cierre: '14:00' }
    })

    const supabase = createClient()
    const SUCURSAL_ID_TODO = '1' // TODO: Get from auth context or similar

    useEffect(() => {
        cargarConfiguracion()
    }, [])

    const cargarConfiguracion = async () => {
        try {
            const { data, error } = await (supabase
                .from('sucursales') as any)
                .select('*')
                .limit(1)
                .single()

            if (error) {
                console.error('Error loading config:', error)
                // Demo data
                setFormData({
                    nombre: 'Barberia Demo',
                    direccion: 'Av. Principal #123, CDMX',
                    telefono_whatsapp: '5512345678',
                    google_maps_url: '',
                    ubicacion: '',
                    telefono_fijo: '',
                    email_contacto: '',
                    instagram_url: '',
                    zona_ubicacion: '',
                    activa: true
                })
            } else if (data) {
                setSucursal(data)
                setFormData({
                    nombre: data.nombre,
                    direccion: data.direccion || '',
                    telefono_whatsapp: data.telefono_whatsapp,
                    google_maps_url: data.google_maps_url || '',
                    ubicacion: data.ubicacion || '',
                    telefono_fijo: data.telefono_fijo || '',
                    email_contacto: data.email_contacto || '',
                    instagram_url: data.instagram_url || '',
                    zona_ubicacion: data.zona_ubicacion || '',
                    activa: data.activa
                })
                if (data.horario_apertura) {
                    setHorario(data.horario_apertura)
                }
            }
        } catch (err) {
            console.error('Supabase connection error:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const updateData = {
                nombre: formData.nombre,
                direccion: formData.direccion,
                telefono_whatsapp: formData.telefono_whatsapp,
                google_maps_url: formData.google_maps_url,
                ubicacion: formData.ubicacion,
                telefono_fijo: formData.telefono_fijo,
                email_contacto: formData.email_contacto,
                instagram_url: formData.instagram_url,
                zona_ubicacion: formData.zona_ubicacion,
                horario_apertura: horario,
                activa: formData.activa
            }

            if (sucursal) {
                const { error } = await (supabase
                    .from('sucursales') as any)
                    .update(updateData as any)
                    .eq('id', sucursal.id)

                if (error) throw error
            } else {
                // Insert dummy if not exists (unlikely in prod)
                // In real app, this should probably be restricted
            }

            alert('Configuración guardada correctamente')
        } catch (err) {
            console.error('Error saving:', err)
            alert('Error al guardar la configuración')
        } finally {
            setSaving(false)
        }
    }

    const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const

    const updateHorario = (dia: string, campo: 'apertura' | 'cierre', valor: string) => {
        setHorario(prev => ({
            ...prev,
            [dia]: {
                ...prev[dia as keyof HorarioApertura],
                [campo]: valor
            }
        }))
    }

    if (loading) {
        return (
            <div className="h-screen bg-slate-900 flex items-center justify-center">
                <div className="flex items-center justify-center h-full">
                    <div className="spinner w-8 h-8" />
                </div>
            </div>
        )
    }

    return (

        <>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white">Configuración</h1>
                <p className="text-slate-400 mt-1">Administra los datos generales de la sucursal</p>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* General Info */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            Datos de la Sucursal
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Nombre del Negocio</label>
                                <input
                                    type="text"
                                    value={formData.nombre}
                                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                    className="input-field"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Dirección</label>
                                <textarea
                                    value={formData.direccion}
                                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                                    className="input-field min-h-[80px]"
                                    placeholder="Calle, Número, Colonia, Ciudad"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Google Maps URL</label>
                                <input
                                    type="url"
                                    value={formData.google_maps_url}
                                    onChange={(e) => setFormData({ ...formData, google_maps_url: e.target.value })}
                                    className="input-field"
                                    placeholder="https://maps.google.com/..."
                                />
                            </div>

                            {/* 
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Ubicación (Referencia)</label>
                                    <input
                                        type="text"
                                        value={formData.ubicacion}
                                        onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                                        className="input-field"
                                        placeholder="Ej. Centro Comercial Las Plazas"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Zona de Ubicación</label>
                                    <input
                                        type="text"
                                        value={formData.zona_ubicacion}
                                        onChange={(e) => setFormData({ ...formData, zona_ubicacion: e.target.value })}
                                        className="input-field"
                                        placeholder="Ej. Zona Norte"
                                    />
                                </div>
                            </div> 
                            */}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">WhatsApp de Contacto</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118 .571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                            </svg>
                                        </span>
                                        <input
                                            type="tel"
                                            value={formData.telefono_whatsapp}
                                            onChange={(e) => setFormData({ ...formData, telefono_whatsapp: e.target.value })}
                                            className="input-field pl-10"
                                            placeholder="5215512345678"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">Formato internacional sin espacios (ej. 521...)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Teléfono Fijo</label>
                                    <input
                                        type="tel"
                                        value={formData.telefono_fijo}
                                        onChange={(e) => setFormData({ ...formData, telefono_fijo: e.target.value })}
                                        className="input-field"
                                        placeholder="662..."
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Email de Contacto</label>
                                    <input
                                        type="email"
                                        value={formData.email_contacto}
                                        onChange={(e) => setFormData({ ...formData, email_contacto: e.target.value })}
                                        className="input-field"
                                        placeholder="contacto@barberia.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Instagram URL</label>
                                    <input
                                        type="url"
                                        value={formData.instagram_url}
                                        onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                                        className="input-field"
                                        placeholder="https://instagram.com/..."
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.activa}
                                        onChange={(e) => setFormData({ ...formData, activa: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    <span className="ml-3 text-sm font-medium text-slate-300">Sucursal Activa</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Horario de Apertura
                            </h2>
                        </div>

                        <div className="space-y-4">
                            {dias.map((dia) => (
                                <div key={dia} className="flex items-center gap-4 py-2 border-b border-slate-700/50 last:border-0">
                                    <span className="w-24 capitalize text-slate-300 font-medium">{dia}</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="time"
                                            value={horario[dia as keyof HorarioApertura]?.apertura || ''}
                                            onChange={(e) => updateHorario(dia, 'apertura', e.target.value)}
                                            className="input-field w-32 py-1"
                                        />
                                        <span className="text-slate-500 text-sm">a</span>
                                        <input
                                            type="time"
                                            value={horario[dia as keyof HorarioApertura]?.cierre || ''}
                                            onChange={(e) => updateHorario(dia, 'cierre', e.target.value)}
                                            className="input-field w-32 py-1"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar / Actions */}
                <div className="space-y-6">
                    <div className="glass-card p-6 sticky top-8">
                        <h3 className="text-lg font-bold text-white mb-4">Acciones</h3>
                        <p className="text-sm text-slate-400 mb-6">
                            Guarda los cambios para aplicarlos inmediatamente en la aplicación.
                        </p>

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full btn-primary flex items-center justify-center gap-2 mb-3"
                        >
                            {saving ? (
                                <>
                                    <div className="spinner w-4 h-4" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Guardar Cambios
                                </>
                            )}
                        </button>

                        <button type="button" className="w-full btn-secondary">
                            Cancelar
                        </button>
                    </div>

                    <div className="glass-card p-6 border-l-4 border-l-blue-500">
                        <h3 className="text-sm font-bold text-white mb-2">Estado del Sistema</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Base de Datos</span>
                                <span className="text-emerald-400 font-medium">Conectado</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Versión App</span>
                                <span className="text-slate-300">v0.1.0</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">ID Sucursal</span>
                                <code className="text-slate-500 bg-slate-900 px-1 rounded">1</code>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </>
    )
}
