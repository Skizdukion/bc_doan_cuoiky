export class BatchPromise<T, G> {
  protected totalTimes: number
  protected batchRange: number | undefined
  protected skipIndex: number | undefined
  protected func: (index: number) => Promise<T>
  protected maxRetries: number | undefined
  protected batchResolve: ((batch: any[]) => Promise<G>) | undefined
  protected loader: PromiseManager<T>

  constructor(totalTimes: number, func: (index: number) => Promise<T>) {
    this.func = func
    this.totalTimes = totalTimes
    this.loader = new PromiseManager(func)
  }

  setAfterBatchResolve(f: (batch: T[]) => Promise<G>) {
    this.batchResolve = f
    return this
  }

  setMaxRetries(maxRetry: number) {
    this.maxRetries = maxRetry
    this.loader.maxRetries = maxRetry
    return this
  }

  setBatchRange(range: number) {
    this.batchRange = range
    this.loader.activeRetry = range
    return this
  }

  setSkipIndex(skipIndex: number) {
    this.skipIndex = skipIndex
    return this
  }

  async execute() {
    const _range = this.batchRange ?? this.totalTimes

    let times = Math.ceil(this.totalTimes / _range)

    let skip = Math.floor(this.skipIndex ?? 0 / _range)

    for (let index = skip; index < times; index++) {
      console.log("times: " + index)
      const end = _range * (index + 1) > this.totalTimes ? this.totalTimes : _range * (index + 1)
      const start = _range * index

      // const batch = Array.from(new Array(end - _range * index), (f, ix) => this.func(start + ix))

      this.loader.createBatch(start, end)

      await this.loader.resolveCurrentBatch()

      console.log("Error accumulate: " + this.loader.errorsIndex.length)
    }

    await this.loader.cleanUpError()

    const successPromise: (T | undefined)[] = []

    for (let [key, value] of this.loader.promiseResultMap) {
      if (value.isSuccess) {
        successPromise.push(value.result)
      }
    }

    console.log("Success: " + successPromise.length)

    if (this.batchResolve) {
      const result: G = await this.batchResolve(successPromise)
    }
  }
}

export class PromiseManager<T> {
  public promiseResultMap: Map<number, Records<T>> = new Map()

  public maxRetries: number = 1

  public activeRetry: number = 200

  private currentBatch: Promise<T>[] = []

  public counting: number = 0

  public errorsIndex: number[] = []

  constructor(private func: (index: number) => Promise<T>) {}

  public async createBatch(fromIndex: number, toIndex: number) {
    this.currentBatch = Array.from(new Array(toIndex - fromIndex), (f, ix) =>
      this.func(fromIndex + ix)
    )
  }

  public setSkip(skip: number) {
    this.counting = skip
  }

  public async resolveCurrentBatch() {
    const result = await Promise.allSettled(this.currentBatch)
    for (let index = 0; index < result.length; index++) {
      const element = result[index]
      const records: Records<T> = {
        counts: 0,
        index: index,
        result: undefined,
        isSuccess: false,
      }
      if (element.status == "fulfilled") {
        records.result = element.value
        records.isSuccess = true
        this.promiseResultMap.set(this.counting + index, records)
      }
      if (element.status == "rejected") {
        records.counts = records.counts + 1
        this.promiseResultMap.set(this.counting + index, records)
        this.errorsIndex.push(this.counting + index)
      }
    }

    console.log("Resolve " + this.currentBatch.length + " items")
    console.log("Result length " + this.promiseResultMap.size)
    this.counting += this.currentBatch.length
    this.currentBatch = []
  }

  public async cleanUpError() {
    console.log("Clean up error")
    while (this.errorsIndex.length > 0) {
      console.log("Remaining error: " + this.errorsIndex.length)
      // const errorBatch: Records<T>[] = Array.from(new Array(end), (f, ix) => {
      //   const error: Records<T> = this.promiseResultMap.get(ix) as Records<T>
      //   return error
      // })

      const result = await Promise.allSettled(
        this.errorsIndex.map((item) => this.func(this.promiseResultMap.get(item)?.index!))
      )
      
      let jindex = 0
      while (jindex < this.errorsIndex.length) {
        const element = result[jindex]
        const records: Records<T> = this.promiseResultMap.get(this.errorsIndex[jindex])!
        if (element.status == "fulfilled") {
          records.result = element.value
          records.isSuccess = true
          this.promiseResultMap.set(records.index, records)
          this.errorsIndex.splice(jindex, 1)
        }
        if (element.status == "rejected") {
          records.counts = records.counts++
          if (records.counts > this.maxRetries) {
            this.errorsIndex.splice(jindex, 1)
          } else {
            this.promiseResultMap.set(records.index, records)
            jindex++
          }
        }
      }
    }
  }
}

type Records<T> = {
  counts: number
  index: number
  result: T | undefined
  isSuccess: boolean
}
