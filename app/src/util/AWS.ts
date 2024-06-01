import { Foot, SerializableState, SerializableNode } from "./ParityDataTypes"

const LAMBDA_GET_NEXT_SONG =
  "https://fvzwv57y4dzkar626oks7kr5tu0opmju.lambda-url.us-east-1.on.aws/"
const LAMBDA_SAVE_ANNOTATION =
  "https://sagnvg4uvaqnganzsmjg3egryu0pqapk.lambda-url.us-east-1.on.aws/"

export interface GetNextSongResponse {
  song_id: number
  song_title: string
  sm_url: string
  audio_url: string
}

export async function getNextSong() {
  const response = await fetch(LAMBDA_GET_NEXT_SONG)
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
