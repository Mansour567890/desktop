import * as React from 'react'
import * as Path from 'path'

import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import { List, ClickSource } from '../lib/list'
import {
  AppFileStatus,
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { ICommitMessage } from '../../lib/app-state'
import { IGitHubUser } from '../../lib/databases'
import { Dispatcher } from '../../lib/dispatcher'
import { IAutocompletionProvider } from '../autocompletion'
import { Repository } from '../../models/repository'
import { showContextualMenu } from '../main-process-proxy'
import { IAuthor } from '../../models/author'
import { ITrailer } from '../../lib/git/interpret-trailers'
import { IMenuItem } from '../../lib/menu-item'

const RowHeight = 29

const GitIgnoreFileName = '.gitignore'

const RestrictedFileExtensions = ['.cmd', '.exe', '.bat', '.sh']

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFileIDs: string[]
  readonly onFileSelectionChanged: (row: number[]) => void
  readonly onIncludeChanged: (path: string, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (
    summary: string,
    description: string | null,
    trailers?: ReadonlyArray<ITrailer>
  ) => Promise<boolean>
  readonly onDiscardChanges: (file: WorkingDirectoryFileChange) => void
  readonly onDiscardAllChanges: (
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) => void

  /**
   * Called to reveal a file in the native file manager.
   * @param path The path of the file relative to the root of the repository
   */
  readonly onRevealInFileManager: (path: string) => void

  /**
   * Called to open a file it its default application
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly gitHubUser: IGitHubUser | null
  readonly dispatcher: Dispatcher
  readonly availableWidth: number
  readonly isCommitting: boolean

  /**
   * Click event handler passed directly to the onRowClick prop of List, see
   * List Props for documentation.
   */
  readonly onRowClick?: (row: number, source: ClickSource) => void

  readonly commitMessage: ICommitMessage | null
  readonly contextualCommitMessage: ICommitMessage | null

  /** The autocompletion providers available to the repository. */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  /** Called when the given pattern should be ignored. */
  readonly onIgnore: (pattern: string | string[]) => void

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Called to open a file using the user's configured applications
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenInExternalEditor: (path: string) => void
}

export class ChangesList extends React.Component<IChangesListProps, {}> {
  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow = (row: number): JSX.Element => {
    const file = this.props.workingDirectory.files[row]
    const selection = file.selection.getSelectionType()

    const includeAll =
      selection === DiffSelectionType.All
        ? true
        : selection === DiffSelectionType.None ? false : null

    return (
      <ChangedFile
        path={file.path}
        status={file.status}
        oldPath={file.oldPath}
        include={includeAll}
        key={file.id}
        onContextMenu={this.onItemContextMenu}
        onIncludeChanged={this.props.onIncludeChanged}
        availableWidth={this.props.availableWidth}
      />
    )
  }

  private get includeAllValue(): CheckboxValue {
    const includeAll = this.props.workingDirectory.includeAll
    if (includeAll === true) {
      return CheckboxValue.On
    } else if (includeAll === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  private onDiscardAllChanges = () => {
    this.props.onDiscardAllChanges(this.props.workingDirectory.files)
  }

  private onDiscardChanges = (paths: string | string[]) => {
    const workingDirectory = this.props.workingDirectory

    if (paths instanceof Array) {
      const files: WorkingDirectoryFileChange[] = []
      paths.forEach(path => {
        const file = workingDirectory.files.find(f => f.path === path)
        if (file) {
          files.push(file)
        }
      })
      if (files.length) {
        this.props.onDiscardAllChanges(files)
      }
    } else {
      const file = workingDirectory.files.find(f => f.path === paths)
      if (!file) {
        return
      }

      this.props.onDiscardChanges(file)
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: this.onDiscardAllChanges,
        enabled: this.props.workingDirectory.files.length > 0,
      },
    ]

    showContextualMenu(items)
  }

  private onItemContextMenu = (
    path: string,
    status: AppFileStatus,
    event: React.MouseEvent<any>
  ) => {
    event.preventDefault()

    const fileList = this.props.workingDirectory.files
    const selectedFiles = new Array<WorkingDirectoryFileChange>()
    const paths = new Array<string>()
    const extensions = new Set<string>()

    this.props.selectedFileIDs.forEach(fileID => {
      const newFile = fileList.find(file => file.id === fileID)
      if (newFile) {
        selectedFiles.push(newFile)
        paths.push(newFile.path)
        extensions.add(Path.extname(newFile.path))
      }
    })

    const items: IMenuItem[] = [
      {
        label:
          paths.length === 1
            ? __DARWIN__ ? `Discard Changes…` : `Discard changes…`
            : __DARWIN__
              ? `Discard ${paths.length} Selected Changes…`
              : `Discard ${paths.length} selected changes…`,
        action: () => this.onDiscardChanges(paths),
      },
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: () => this.onDiscardAllChanges(),
      },
      { type: 'separator' },
    ]

    if (paths.length === 1) {
      items.push({
        label: __DARWIN__ ? 'Ignore File' : 'Ignore file',
        action: () => this.props.onIgnore(path),
        enabled: Path.basename(path) !== GitIgnoreFileName,
      })
    } else if (paths.length > 1) {
      items.push({
        label: `Ignore ${paths.length} selected files`,
        action: () => {
          // Filter out any .gitignores that happens to be selected, ignoring
          // those doesn't make sense.
          this.props.onIgnore(
            paths.filter(path => Path.basename(path) !== GitIgnoreFileName)
          )
        },
        // Enable this action as long as there's something selected which isn't
        // a .gitignore file.
        enabled: paths.some(path => Path.basename(path) !== GitIgnoreFileName),
      })
    }

    extensions.forEach(extension => {
      if (extension) {
        items.push({
          label: __DARWIN__
            ? `Ignore All ${extension} Files`
            : `Ignore all ${extension} files`,
          action: () => this.props.onIgnore(`*${extension}`),
        })
      }
    })

    const isSafeExtension = __WIN32__
      ? extensions.every(
          extension =>
            !RestrictedFileExtensions.includes(extension.toLowerCase())
        )
      : true

    const revealInFileManagerLabel = __DARWIN__
      ? 'Reveal in Finder'
      : __WIN32__ ? 'Show in Explorer' : 'Show in your File Manager'

    const openInExternalEditor = this.props.externalEditorLabel
      ? `Open in ${this.props.externalEditorLabel}`
      : __DARWIN__ ? 'Open in External Editor' : 'Open in external editor'

    items.push(
      { type: 'separator' },
      {
        label: revealInFileManagerLabel,
        action: () => this.props.onRevealInFileManager(path),
        enabled: status !== AppFileStatus.Deleted,
      },
      {
        label: openInExternalEditor,
        action: () => this.props.onOpenInExternalEditor(path),
        enabled: isSafeExtension && status !== AppFileStatus.Deleted,
      },
      {
        label: __DARWIN__
          ? 'Open with Default Program'
          : 'Open with default program',
        action: () => this.props.onOpenItem(path),
        enabled: isSafeExtension && status !== AppFileStatus.Deleted,
      }
    )

    showContextualMenu(items)
  }

  public render() {
    const fileList = this.props.workingDirectory.files
    const selectedRows = this.props.selectedFileIDs.map(id =>
      fileList.findIndex(file => file.id === id)
    )
    const fileCount = fileList.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    const anyFilesSelected =
      fileCount > 0 && this.includeAllValue !== CheckboxValue.Off

    return (
      <div className="changes-list-container file-list">
        <div className="header" onContextMenu={this.onContextMenu}>
          <Checkbox
            label={filesDescription}
            value={this.includeAllValue}
            onChange={this.onIncludeAllChanged}
            disabled={fileCount === 0}
          />
        </div>

        <List
          id="changes-list"
          rowCount={this.props.workingDirectory.files.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderRow}
          selectedRows={selectedRows}
          selectionMode="multi"
          onSelectionChanged={this.props.onFileSelectionChanged}
          invalidationProps={this.props.workingDirectory}
          onRowClick={this.props.onRowClick}
        />

        <CommitMessage
          onCreateCommit={this.props.onCreateCommit}
          branch={this.props.branch}
          gitHubUser={this.props.gitHubUser}
          commitAuthor={this.props.commitAuthor}
          anyFilesSelected={anyFilesSelected}
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          commitMessage={this.props.commitMessage}
          contextualCommitMessage={this.props.contextualCommitMessage}
          autocompletionProviders={this.props.autocompletionProviders}
          isCommitting={this.props.isCommitting}
          showCoAuthoredBy={this.props.showCoAuthoredBy}
          coAuthors={this.props.coAuthors}
        />
      </div>
    )
  }
}
