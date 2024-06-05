import { Foot } from "./ParityDataTypes"

const LAMBDA_GET_NEXT_SONG =
  "https://fvzwv57y4dzkar626oks7kr5tu0opmju.lambda-url.us-east-1.on.aws/"
const LAMBDA_SAVE_ANNOTATION =
  "https://sagnvg4uvaqnganzsmjg3egryu0pqapk.lambda-url.us-east-1.on.aws/"
const S3_SONG_PACK_JSON =
  "https://d1uua2y0otb20p.cloudfront.net/_assets/song_packs.json"

export interface GetNextSongResponse {
  song_id: number
  song_title: string
  sm_url: string
  audio_url: string
}

export async function getNextSong(pack_id: number | undefined = undefined) {
  if (pack_id) {
    return getNextSongFromPack(pack_id)
  }

  const response = await fetch(LAMBDA_GET_NEXT_SONG)
  const responseJson: GetNextSongResponse = await response.json()

  return responseJson
}

export async function getNextSongFromPack(pack_id: number) {
  const url = `${LAMBDA_GET_NEXT_SONG}?pack_id=${pack_id}`
  const response = await fetch(url)
  const responseJson: GetNextSongResponse = await response.json()

  return responseJson
}

export interface AnnotationData {
  selected_nodes: number[]
  overrides: { [key: number]: Foot[] }
  parities: Foot[][]
}

export async function saveAnnotation(
  userId: string,
  songId: number,
  annotation: AnnotationData
) {
  const requestBody = {
    user_id: userId,
    song_id: songId,
    annotation: annotation,
  }

  const requestBodyString = JSON.stringify(requestBody)

  const response = await fetch(LAMBDA_SAVE_ANNOTATION, {
    body: requestBodyString,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
  return response.ok
}

export interface SongPackData {
  pack_id: number
  pack_name: string
  total_songs: number
  total_annotations: number
  songs_with_one_annotation: number
  songs_with_three_annotations: number
}

export async function getSongPacks() {
  const response = await fetch(S3_SONG_PACK_JSON)
  const responseJson: SongPackData[] = await response.json()
  return responseJson
}
