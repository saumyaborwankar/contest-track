import { Injectable } from '@nestjs/common';
import { GoogleCalendarService } from './google.service';

@Injectable()
export class AppService {
  constructor(private google: GoogleCalendarService) {}
  async getHello() {
    await this.google.makeCalendarEvents();
    return 'Hello World!';
  }
}
