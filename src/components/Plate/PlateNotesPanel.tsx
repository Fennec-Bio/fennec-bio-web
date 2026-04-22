'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { PlateExperimentDetail } from '@/hooks/usePlateExperiment'

type Comment = {
  id: number
  text: string
  author_name: string
  author_picture: string
  created_at: string
  updated_at: string
}

type NoteImage = {
  id: number
  gcs_url: string
  filename: string
  uploaded_at: string
}

export function PlateNotesPanel({
  experiment, onSaved,
}: {
  experiment: PlateExperimentDetail
  onSaved: () => void
}) {
  const { getToken } = useAuth()
  const API = process.env.NEXT_PUBLIC_API_URL
  const id = experiment.id

  const [note, setNote] = useState(experiment.experiment_note)
  const [noteDirty, setNoteDirty] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [images, setImages] = useState<NoteImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNote(experiment.experiment_note)
    setNoteDirty(false)
  }, [experiment.experiment_note])

  const fetchComments = useCallback(async () => {
    const token = await getToken()
    const r = await fetch(`${API}/api/plate-experiments/${id}/comments/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) setComments((await r.json()).comments)
  }, [API, getToken, id])

  const fetchImages = useCallback(async () => {
    const token = await getToken()
    const r = await fetch(`${API}/api/plate-experiments/${id}/note-images/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) setImages((await r.json()).images)
  }, [API, getToken, id])

  useEffect(() => { fetchComments(); fetchImages() }, [fetchComments, fetchImages])

  async function saveNote() {
    setSavingNote(true)
    try {
      const token = await getToken()
      const r = await fetch(`${API}/api/plate-experiments/${id}/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment_note: note }),
      })
      if (r.ok) { setNoteDirty(false); onSaved() }
    } finally {
      setSavingNote(false)
    }
  }

  async function postComment() {
    const text = newComment.trim()
    if (!text) return
    setPostingComment(true)
    try {
      const token = await getToken()
      const r = await fetch(`${API}/api/plate-experiments/${id}/comments/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (r.ok) {
        setNewComment('')
        fetchComments()
      }
    } finally {
      setPostingComment(false)
    }
  }

  async function uploadImage(file: File) {
    setImgError(null)
    setUploading(true)
    try {
      const token = await getToken()
      const fd = new FormData()
      fd.append('image', file)
      const r = await fetch(`${API}/api/plate-experiments/${id}/note-images/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${r.status}`)
      }
      fetchImages()
    } catch (e) {
      setImgError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Notes</h3>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setNoteDirty(true) }}
          rows={4}
          placeholder="Add notes for this plate experiment…"
          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234] text-sm"
        />
        {noteDirty && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={saveNote}
              disabled={savingNote}
              className="px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
            >
              {savingNote ? 'Saving…' : 'Save note'}
            </button>
            <button
              onClick={() => { setNote(experiment.experiment_note); setNoteDirty(false) }}
              className="px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Images</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
          disabled={uploading}
          className="text-sm"
        />
        {imgError && <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{imgError}</div>}
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            {images.map(img => (
              <a
                key={img.id}
                href={img.gcs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-gray-200 rounded overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.gcs_url}
                  alt={img.filename}
                  className="w-full h-24 object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Comments</h3>
        <div className="space-y-2 mb-3">
          {comments.length === 0 ? (
            <div className="text-sm text-gray-500">No comments yet.</div>
          ) : comments.map(c => (
            <div key={c.id} className="border-b border-gray-200 pb-2 text-sm">
              <div className="font-medium text-gray-900">{c.author_name}</div>
              <div className="text-gray-700 whitespace-pre-wrap">{c.text}</div>
              <div className="text-xs text-gray-500">
                {new Date(c.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }}
            placeholder="Add a comment…"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
          />
          <button
            onClick={postComment}
            disabled={postingComment || !newComment.trim()}
            className="px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </section>
    </div>
  )
}
